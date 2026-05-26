/**
 * POST /api/invitations/[token]/accept
 *
 * Callback appelé une fois que l'utilisateur est authentifié via Clerk
 * (signup ou signin), pour finaliser l'acceptation d'une invitation :
 * crée la Membership active et marque l'Invitation comme acceptée.
 *
 * Cette route nécessite que l'user soit déjà loggé via Clerk. Si pas le
 * cas, le caller (page /invitations/accept) doit d'abord rediriger vers
 * sign-up/sign-in avec ?invitation=token en query.
 *
 * Vérifications :
 *   - token existe + non expiré + non révoqué + non déjà accepté
 *   - email Clerk de l'user match l'email invité (sécurité : pas de
 *     hijacking d'invitation par changement de compte)
 *
 * Si tout est bon :
 *   - Crée le User en DB s'il n'existe pas (lazy creation alignée sur
 *     /api/onboarding existant)
 *   - Crée la Membership active (joinedAt = NOW)
 *   - Marque l'Invitation acceptedAt = NOW + acceptedMembershipId
 *
 * Tout en une transaction Prisma pour éviter les états partiels.
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { checkInvitationAcceptable } from "@/lib/invitations";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return Response.json({ error: "Token manquant" }, { status: 400 });
    }

    // 1. Identifier l'user Clerk courant
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }
    const clerk = await currentUser();
    const clerkEmail = clerk?.emailAddresses[0]?.emailAddress?.toLowerCase();
    if (!clerkEmail) {
      return Response.json(
        { error: "Email Clerk introuvable" },
        { status: 400 }
      );
    }

    // 2. Charger l'invitation et valider son état
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!invitation) {
      return Response.json(
        { error: "Invitation introuvable" },
        { status: 404 }
      );
    }

    // Vérifications d'état déléguées à un helper pur (testable). Status :
    //   - 409 Conflict si déjà acceptée (état définitif)
    //   - 410 Gone si révoquée ou expirée
    const acceptableCheck = checkInvitationAcceptable(invitation);
    if (!acceptableCheck.ok) {
      return Response.json(
        { error: acceptableCheck.message },
        { status: acceptableCheck.status }
      );
    }

    if (invitation.email.toLowerCase() !== clerkEmail) {
      return Response.json(
        {
          error:
            "L'email de votre compte ne correspond pas à l'email invité. Connectez-vous avec le bon compte.",
        },
        { status: 403 }
      );
    }

    // 3. Tout est bon → transaction : user ↔ membership ↔ invitation
    const result = await prisma.$transaction(async (tx) => {
      // 3a. User : upsert (lazy creation, aligné sur /api/onboarding).
      // Le user peut déjà exister (compte Clerk pre-existant qui rejoint
      // un nouveau workspace) ou pas (nouveau signup via le lien).
      let user = await tx.user.findUnique({ where: { clerkId } });
      if (!user) {
        user = await tx.user.create({
          data: {
            clerkId,
            email: clerkEmail,
            name: clerk?.firstName
              ? `${clerk.firstName}${clerk.lastName ? ` ${clerk.lastName}` : ""}`
              : clerkEmail,
            // companyId est obligatoire dans le schéma actuel (rétrocompat
            // pré-Phase-2). On le pointe vers la company de l'invitation
            // — pour un user totalement nouveau, c'est sa "company par
            // défaut" qui sera retirée en V3.
            companyId: invitation.companyId,
          },
        });
      }

      // 3b. Membership : upsert active. Le @@unique([userId, companyId])
      // garantit qu'on ne crée pas de doublon — si elle existe (cas où
      // un membre a été révoqué puis ré-invité), on la "réactive" en
      // mettant à jour joinedAt + revokedAt = null.
      const membership = await tx.membership.upsert({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: invitation.companyId,
          },
        },
        create: {
          userId: user.id,
          companyId: invitation.companyId,
          role: "MEMBER",
          invitedByUserId: invitation.invitedByUserId,
          invitedAt: invitation.createdAt,
          joinedAt: new Date(),
        },
        update: {
          // Cas ré-invitation après révocation
          joinedAt: new Date(),
          revokedAt: null,
          invitedByUserId: invitation.invitedByUserId,
        },
      });

      // 3c. Marquer l'invitation comme acceptée
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: new Date(),
          acceptedMembershipId: membership.id,
        },
      });

      return { user, membership };
    });

    return Response.json({
      data: {
        companyId: invitation.companyId,
        companyName: invitation.company.name,
        membershipId: result.membership.id,
      },
    });
  } catch (err) {
    console.error("[POST /api/invitations/[token]/accept]", err);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

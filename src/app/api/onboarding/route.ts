import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const OnboardingSchema = z.object({
  companyName: z.string().min(1, "Nom de société requis"),
  siret: z.string().min(14).max(14).optional().or(z.literal("")),
  tvaIntra: z.string().optional().or(z.literal("")),
  address: z.string().min(1, "Adresse requise"),
  city: z.string().default(""),
  postalCode: z.string().default(""),
  email: z.string().email("Email invalide"),
  phone: z.string().optional().or(z.literal("")),
  iban: z.string().optional().or(z.literal("")),
  bic: z.string().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return Response.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Vérifier que cet utilisateur n'a pas déjà un profil
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) {
    return Response.json({ error: "Profil déjà configuré" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = OnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Données invalides", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Récupérer les infos Clerk pour nommer l'utilisateur
  const clerkUser = await currentUser();
  const userName =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    clerkUser?.emailAddresses[0]?.emailAddress ||
    "Utilisateur";
  const userEmail =
    clerkUser?.emailAddresses[0]?.emailAddress ?? "";

  // Créer la société et l'utilisateur en une seule transaction
  const { user } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.upsert({ where: { siret: input.siret || "" }, update: {}, create: {
      data: {
        clerkOrgId: clerkId, // On utilise le clerkId comme identifiant unique en mode solo
        name: input.companyName,
        siret: input.siret || "",
        tvaIntra: input.tvaIntra || "",
        address: input.address,
        city: input.city,
        postalCode: input.postalCode,
        email: input.email,
        phone: input.phone || "",
        iban: input.iban || "",
        bic: input.bic || "",
      },
    });

    const user = await tx.user.upsert({ where: { clerkId: clerkId }, update: { email: userEmail, name: userName }, create: {
      data: {
        clerkId,
        email: userEmail,
        name: userName,
        role: "ADMIN", // Premier utilisateur = Admin
        companyId: company.id,
    },
      },
    });

    return { company, user };
  });

  return Response.json({ data: { userId: user.id } }, { status: 201 });
}
export const dynamic = 'force-dynamic';

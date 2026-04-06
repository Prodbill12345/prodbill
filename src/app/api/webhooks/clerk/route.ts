import { headers } from "next/headers";
import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";

type ClerkUserEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    email_addresses: { email_address: string; id: string }[];
    primary_email_address_id: string;
    first_name: string | null;
    last_name: string | null;
    public_metadata: { role?: string; companyId?: string };
  };
};

type ClerkOrgMembershipEvent = {
  type: "organizationMembership.created" | "organizationMembership.updated";
  data: {
    public_user_data: {
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      identifier: string;
    };
    organization: { id: string; name: string };
    role: string;
  };
};

type ClerkEvent = ClerkUserEvent | ClerkOrgMembershipEvent;

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook secret manquant" }, { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Headers Svix manquants" }, { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: ClerkEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch {
    return Response.json({ error: "Signature invalide" }, { status: 400 });
  }

  // Gestion des événements d'appartenance à une organisation
  if (
    evt.type === "organizationMembership.created" ||
    evt.type === "organizationMembership.updated"
  ) {
    const { public_user_data, organization } = (evt as ClerkOrgMembershipEvent).data;
    const clerkId = public_user_data.user_id;
    const email = public_user_data.identifier;
    const name =
      [public_user_data.first_name, public_user_data.last_name]
        .filter(Boolean)
        .join(" ") || email;

    // Trouver ou créer la société
    const company = await prisma.company.upsert({
      where: { clerkOrgId: organization.id },
      update: {},
      create: {
        clerkOrgId: organization.id,
        name: organization.name,
        siret: "",
        tvaIntra: "",
        address: "",
        iban: "",
        bic: "",
      },
    });

    await prisma.user.upsert({
      where: { clerkId },
      update: { name, email },
      create: {
        clerkId,
        email,
        name,
        role: "STAGIAIRE",
        companyId: company.id,
      },
    });

    return Response.json({ success: true });
  }

  return Response.json({ success: true });
}
export const dynamic = 'force-dynamic';

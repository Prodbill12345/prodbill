import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateClientSchema = z.object({
  name: z.string().min(1).optional(),
  siret: z.string().optional(),
  tvaIntra: z.string().optional(),
  address: z.string().min(1).optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  tauxFgOverride: z.number().min(0).max(1).nullable().optional(),
  tauxMargeOverride: z.number().min(0).max(1).nullable().optional(),
  notes: z.string().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("client:read");
    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        devis: {
          include: { client: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        factures: {
          include: { paiements: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!client) {
      return Response.json({ error: "Client introuvable" }, { status: 404 });
    }

    return Response.json({ data: client });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("client:edit");
    const { id } = await params;

    const existing = await prisma.client.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!existing) {
      return Response.json({ error: "Client introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const input = UpdateClientSchema.parse(body);

    const client = await prisma.client.update({
      where: { id },
      data: input,
    });

    return Response.json({ data: client });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateClientSchema = z.object({
  name: z.string().min(1),
  siret: z.string().optional(),
  tvaIntra: z.string().optional(),
  address: z.string().min(1),
  city: z.string().default(""),
  postalCode: z.string().default(""),
  email: z.string().email(),
  phone: z.string().optional(),
  tauxFgOverride: z.number().min(0).max(1).nullable().optional(),
  tauxMargeOverride: z.number().min(0).max(1).nullable().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const user = await requireAuth("client:read");

    const clients = await prisma.client.findMany({
      where: { companyId: user.companyId },
      include: {
        _count: { select: { devis: true, factures: true } },
      },
      orderBy: { name: "asc" },
    });

    return Response.json({ data: clients });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth("client:create");
    const body = await req.json();
    const input = CreateClientSchema.parse(body);

    const client = await prisma.client.create({
      data: {
        companyId: user.companyId,
        ...input,
      },
    });

    return Response.json({ data: client }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  siret: z.string().min(14).optional(),
  tvaIntra: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  nomBanque: z.string().optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().optional(),
  conditionsPaiement: z.string().optional(),
  defaultTauxFg: z.number().min(0).max(1).optional(),
  defaultTauxMarge: z.number().min(0).max(1).optional(),
  defaultTauxCsComedien: z.number().min(0).max(1).optional(),
  defaultTauxCsTech: z.number().min(0).max(1).optional(),
});

export async function GET() {
  try {
    const user = await requireAuth();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
    });
    return Response.json({ data: company });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireAuth("parametres:edit");
    const body = await req.json();
    const input = UpdateCompanySchema.parse(body);

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: input,
    });

    return Response.json({ data: company });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';

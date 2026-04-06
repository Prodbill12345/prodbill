import { requireAuth, handleAuthError } from "@/lib/auth";
import { verifySiret } from "@/lib/sirene";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siret: string }> }
) {
  try {
    await requireAuth("client:read");
    const { siret } = await params;

    const result = await verifySiret(siret);

    if (!result) {
      return Response.json(
        { error: "SIRET introuvable ou invalide" },
        { status: 404 }
      );
    }

    if (result.etatAdministratif === "F") {
      return Response.json(
        { error: "Cet établissement est fermé", data: result },
        { status: 422 }
      );
    }

    return Response.json({ data: result });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';

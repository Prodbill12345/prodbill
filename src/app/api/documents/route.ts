import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";

export async function GET() {
  try {
    const user = await requireAuth("devis:read");

    const docs = await prisma.document.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ data: docs });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireAuth("parametres:edit");

    const url = new URL(req.url);
    const filename = url.searchParams.get("filename");

    if (!filename || !filename.toLowerCase().endsWith(".pdf")) {
      return Response.json({ error: "Nom de fichier PDF requis" }, { status: 400 });
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("application/pdf") && !contentType.includes("octet-stream")) {
      return Response.json({ error: "Seuls les fichiers PDF sont acceptés" }, { status: 400 });
    }

    if (!req.body) {
      return Response.json({ error: "Corps de requête manquant" }, { status: 400 });
    }

    const blob = await put(
      `documents/${user.companyId}/${Date.now()}-${filename}`,
      req.body,
      { access: "public", contentType: "application/pdf" }
    );

    const doc = await prisma.document.create({
      data: {
        companyId: user.companyId,
        name: filename,
        url: blob.url,
      },
    });

    return Response.json({ data: doc }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";

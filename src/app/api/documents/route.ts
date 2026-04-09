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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "Fichier manquant" }, { status: 400 });
    }

    if (file.type !== "application/pdf" && !filename.toLowerCase().endsWith(".pdf")) {
      return Response.json({ error: "Seuls les fichiers PDF sont acceptés" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: "Le fichier ne doit pas dépasser 10 Mo" }, { status: 400 });
    }

    const blob = await put(
      `documents/${user.companyId}/${Date.now()}-${filename}`,
      file,
      {
        access: "public",
        contentType: "application/pdf",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      }
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

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function PUT(req: Request) {
  try {
    const user = await requireAuth("parametres:edit");

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return Response.json(
        { error: "Seules les images PNG/JPG sont acceptées" },
        { status: 400 }
      );
    }

    // Vérification taille
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_SIZE) {
      return Response.json(
        { error: "Logo trop lourd (max 2 Mo)" },
        { status: 413 }
      );
    }

    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("filename") ?? "logo.png";

    let logoUrl: string;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Production : Vercel Blob
      const blob = await put(
        `logos/${user.companyId}/${filename}`,
        req.body!,
        {
          access: "public",
          contentType,
        }
      );
      logoUrl = blob.url;
    } else {
      // Dev local : data URL base64 stockée directement en DB
      const buffer = await req.arrayBuffer();
      if (buffer.byteLength > MAX_SIZE) {
        return Response.json(
          { error: "Logo trop lourd (max 2 Mo)" },
          { status: 413 }
        );
      }
      const base64 = Buffer.from(buffer).toString("base64");
      logoUrl = `data:${contentType};base64,${base64}`;
    }

    await prisma.company.update({
      where: { id: user.companyId },
      data: { logoUrl },
    });

    return Response.json({ url: logoUrl });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';

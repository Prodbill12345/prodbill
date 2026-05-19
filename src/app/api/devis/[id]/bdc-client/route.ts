/**
 * src/app/api/devis/[id]/bdc-client/route.ts
 *
 * Upload / suppression du BDC reçu DU client (PDF/JPG/PNG).
 * Stockage Vercel Blob. Ticket #79.
 *
 * Distinct du modèle BDC (sortant, auto-généré) et de Facture.numeroBdc
 * (référence texte ticket #72).
 *
 * Pattern : voir /api/documents (FormData côté serveur, path préfixé
 * par companyId pour isolation multi-tenant).
 */

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put, del } from "@vercel/blob";

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:edit");
    const { id } = await params;

    const existing = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, bdcClientUrl: true },
    });
    if (!existing) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "Fichier manquant" }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return Response.json(
        { error: "Format non supporté (PDF, JPG ou PNG attendu)" },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return Response.json(
        { error: "Le fichier ne doit pas dépasser 10 Mo" },
        { status: 400 }
      );
    }

    // Si un BDC existait déjà : tenter de supprimer l'ancien blob.
    // Tolérant à l'erreur (blob peut avoir été supprimé manuellement,
    // ou changement de token) — Vanda ne doit pas être bloquée.
    if (existing.bdcClientUrl) {
      try {
        await del(existing.bdcClientUrl, {
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
      } catch (err) {
        console.warn(
          `[bdc-client POST] del() ancien blob échoué, on continue: ${String(err)}`
        );
      }
    }

    // Sanitize le filename pour le path (mais on stocke le nom original
    // en DB pour l'affichage).
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await put(
      `bdc-client/${user.companyId}/${Date.now()}-${safeName}`,
      file,
      {
        access: "public",
        contentType: file.type,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      }
    );

    // Garde-fou : si l'update DB échoue, on supprime le blob frais
    // pour ne pas laisser d'orphelin.
    const uploadedAt = new Date();
    try {
      await prisma.devis.update({
        where: { id },
        data: {
          bdcClientUrl: blob.url,
          bdcClientFilename: file.name,
          bdcClientUploadedAt: uploadedAt,
        },
      });
    } catch (err) {
      try {
        await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (cleanupErr) {
        console.error(
          `[bdc-client POST] CRITICAL: orphan blob (${blob.url}) — cleanup failed: ${String(cleanupErr)}`
        );
      }
      throw err;
    }

    return Response.json({
      data: {
        url: blob.url,
        filename: file.name,
        uploadedAt: uploadedAt.toISOString(),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:edit");
    const { id } = await params;

    const existing = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, bdcClientUrl: true },
    });
    if (!existing) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    if (existing.bdcClientUrl) {
      try {
        await del(existing.bdcClientUrl, {
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
      } catch (err) {
        // Tolérant : on poursuit la mise à jour DB même si le blob
        // est déjà absent côté Vercel.
        console.warn(
          `[bdc-client DELETE] del() blob échoué, on continue: ${String(err)}`
        );
      }
    }

    await prisma.devis.update({
      where: { id },
      data: {
        bdcClientUrl: null,
        bdcClientFilename: null,
        bdcClientUploadedAt: null,
      },
    });

    return Response.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";

"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save, Lock, Upload, X, Info } from "lucide-react";
import Image from "next/image";
import type { Company, Role } from "@/types";
import { InputPct } from "@/components/forms/InputPct";
import { parsePctInput, decimalToPct, pctToDecimal } from "@/lib/parse-pct";
import { pdfAccents, PDF_ACCENT_KEYS } from "@/design/tokens";
import { toPdfAccentKey } from "@/lib/pdf-accent";

// Les taux sont saisis et validés en POURCENTAGE (0..100) côté UI.
// Conversion en décimal (0..1) au moment de l'envoi à l'API (onSubmit).
const ParametresSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  siret: z.string().min(14, "SIRET invalide"),
  tvaIntra: z.string().min(1, "TVA intracommunautaire requise"),
  address: z.string().min(1, "Adresse requise"),
  city: z.string().default(""),
  postalCode: z.string().default(""),
  email: z.string().email("Email invalide"),
  phone: z.string().optional(),
  nomBanque: z.string().default(""),
  iban: z.string().min(1, "IBAN requis"),
  bic: z.string().min(1, "BIC requis"),
  primaryColor: z.string().default("#3B82F6"),
  pdfAccent: z.enum(PDF_ACCENT_KEYS).default("majorelle"),
  conditionsPaiement: z.string().min(1, "Conditions de paiement requises"),
  defaultTauxFg: z.coerce.number().min(0).max(100),
  defaultTauxMarge: z.coerce.number().min(0).max(100),
  defaultTauxCsComedien: z.coerce.number().min(0).max(100),
  defaultTauxCsTech: z.coerce.number().min(0).max(100),
});

type ParametresData = z.infer<typeof ParametresSchema>;

interface ParametresFormProps {
  company: Company;
  userRole: Role;
}

export function ParametresForm({ company, userRole }: ParametresFormProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(company.logoUrl ?? null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canEdit = userRole === "ADMIN";

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ParametresData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(ParametresSchema) as any,
    defaultValues: {
      name: company.name,
      siret: company.siret,
      tvaIntra: company.tvaIntra,
      address: company.address,
      city: company.city,
      postalCode: company.postalCode,
      email: company.email,
      phone: company.phone || "",
      nomBanque: company.nomBanque ?? "",
      iban: company.iban,
      bic: company.bic,
      primaryColor: company.primaryColor,
      // NULL en base = Majorelle (aucun changement d'apparence par défaut).
      pdfAccent: toPdfAccentKey(company.pdfAccent),
      conditionsPaiement: company.conditionsPaiement,
      defaultTauxFg: decimalToPct(company.defaultTauxFg),
      defaultTauxMarge: decimalToPct(company.defaultTauxMarge),
      defaultTauxCsComedien: decimalToPct(company.defaultTauxCsComedien),
      defaultTauxCsTech: decimalToPct(company.defaultTauxCsTech),
    },
  });

  const primaryColor = watch("primaryColor");
  const pdfAccent = watch("pdfAccent");

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoError("Seules les images PNG/JPG sont acceptées");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Taille max : 2 Mo");
      return;
    }

    setLogoError(null);
    setLogoUploading(true);
    try {
      const res = await fetch(
        `/api/company/logo?filename=${encodeURIComponent(file.name)}`,
        {
          method: "PUT",
          headers: { "content-type": file.type },
          body: file,
        }
      );
      if (!res.ok) {
        const err = await res.json();
        setLogoError(err.error ?? "Erreur lors de l'upload");
        return;
      }
      const { url } = await res.json();
      setLogoUrl(url);
    } finally {
      setLogoUploading(false);
      // Réinitialiser l'input pour permettre le re-upload du même fichier
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeLogo() {
    setLogoUrl(null);
    // Supprimer l'URL en base
    await fetch("/api/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: null }),
    });
  }

  async function onSubmit(data: ParametresData) {
    if (!canEdit) return;
    setSaving(true);
    try {
      // Conversion UI (pourcentage) → DB (décimal) avant envoi
      const payload = {
        ...data,
        defaultTauxFg: pctToDecimal(data.defaultTauxFg),
        defaultTauxMarge: pctToDecimal(data.defaultTauxMarge),
        defaultTauxCsComedien: pctToDecimal(data.defaultTauxCsComedien),
        defaultTauxCsTech: pctToDecimal(data.defaultTauxCsTech),
      };
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erreur lors de la sauvegarde");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const fieldProps = (disabled = false) => ({
    disabled: !canEdit || disabled,
    className: `w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue ${
      !canEdit ? "bg-brand-surface text-brand-ink-muted cursor-not-allowed" : ""
    }`,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {!canEdit && (
        <div className="flex items-center gap-2 bg-status-partial-bg border border-status-partial-bg rounded-[var(--radius-control)] px-4 py-3 text-sm text-brand-ink">
          <Lock className="w-4 h-4 shrink-0" />
          Seul un administrateur peut modifier les paramètres de la société.
        </div>
      )}

      {/* Logo */}
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-brand-ink">Logo de la société</h3>
          <p className="text-xs text-brand-ink-muted mt-0.5">
            PNG ou JPG, max 2 Mo — affiché en haut à gauche sur tous les PDFs
          </p>
        </div>

        <div className="flex items-start gap-5">
          {/* Aperçu */}
          <div className="w-28 h-16 border border-dashed border-brand-rule rounded-[var(--radius-control)] flex items-center justify-center bg-brand-surface shrink-0 overflow-hidden">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Logo société"
                width={112}
                height={64}
                className="object-contain w-full h-full p-1"
                unoptimized
              />
            ) : (
              <span className="text-xs text-brand-ink-muted text-center px-2">
                Aperçu logo
              </span>
            )}
          </div>

          {/* Contrôles */}
          {canEdit && (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleLogoChange}
                className="hidden"
                id="logo-upload"
              />
              <label
                htmlFor="logo-upload"
                className={`inline-flex items-center gap-2 px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink hover:bg-brand-surface cursor-pointer transition-colors ${
                  logoUploading ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {logoUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {logoUploading ? "Envoi en cours…" : "Choisir un fichier"}
              </label>

              {logoUrl && !logoUploading && (
                <button
                  type="button"
                  onClick={removeLogo}
                  className="flex items-center gap-1.5 text-xs text-brand-coral-ink hover:text-brand-coral transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Supprimer le logo
                </button>
              )}

              {logoError && (
                <p className="text-brand-coral-ink text-xs">{logoError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Identité société */}
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6 space-y-4">
        <h3 className="font-semibold text-brand-ink">Identité de la société</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Raison sociale *
            </label>
            <input {...register("name")} {...fieldProps()} />
            {errors.name && (
              <p className="text-brand-coral-ink text-xs mt-1">{errors.name.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              SIRET *
            </label>
            <input
              {...register("siret")}
              {...fieldProps()}
              className={fieldProps().className + " font-mono"}
            />
            {errors.siret && (
              <p className="text-brand-coral-ink text-xs mt-1">{errors.siret.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              N° TVA intracommunautaire *
            </label>
            <input
              {...register("tvaIntra")}
              {...fieldProps()}
              className={fieldProps().className + " font-mono"}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Adresse *
            </label>
            <input {...register("address")} {...fieldProps()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Code postal
            </label>
            <input {...register("postalCode")} {...fieldProps()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Ville
            </label>
            <input {...register("city")} {...fieldProps()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Email
            </label>
            <input {...register("email")} type="email" {...fieldProps()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Téléphone
            </label>
            <input {...register("phone")} {...fieldProps()} />
          </div>
        </div>
      </div>

      {/* Coordonnées bancaires */}
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6 space-y-4">
        <h3 className="font-semibold text-brand-ink">Coordonnées bancaires</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Nom de la banque
            </label>
            <input
              {...register("nomBanque")}
              {...fieldProps()}
              placeholder="ex : BNP Paribas"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-brand-ink mb-1">
              IBAN *
            </label>
            <input
              {...register("iban")}
              {...fieldProps()}
              className={
                fieldProps().className + " font-mono tracking-wider"
              }
              placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
            />
            {errors.iban && (
              <p className="text-brand-coral-ink text-xs mt-1">{errors.iban.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              BIC / SWIFT *
            </label>
            <input
              {...register("bic")}
              {...fieldProps()}
              className={fieldProps().className + " font-mono"}
              placeholder="BNPAFRPP"
            />
          </div>
        </div>
      </div>

      {/* Conditions de paiement */}
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-brand-ink">
            Conditions de paiement
          </h3>
          <p className="text-xs text-brand-ink-muted mt-0.5">
            Mention obligatoire art. L441-9 Code de commerce — apparaît sur
            toutes les factures
          </p>
        </div>
        <textarea
          {...register("conditionsPaiement")}
          rows={4}
          disabled={!canEdit}
          className={`w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none ${
            !canEdit ? "bg-brand-surface text-brand-ink-muted cursor-not-allowed" : ""
          }`}
        />
      </div>

      {/* Taux par défaut */}
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-brand-ink">Taux par défaut</h3>
          <p className="text-xs text-brand-ink-muted mt-0.5">
            Ces taux sont appliqués à la création d&apos;un devis
            (surchargeables par devis ou par client)
          </p>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { name: "defaultTauxCsComedien" as const, label: "CS Comédiens" },
            { name: "defaultTauxCsTech" as const, label: "CS Techniciens" },
            { name: "defaultTauxFg" as const, label: "Frais généraux" },
            { name: "defaultTauxMarge" as const, label: "Marge" },
          ].map(({ name, label }) => (
            <div key={name}>
              <label className="block text-xs font-medium text-brand-ink-muted mb-1">
                {label}
              </label>
              <InputPct
                {...register(name, {
                  setValueAs: (v) => parsePctInput(v) ?? 0,
                })}
                disabled={!canEdit}
                invalid={!!errors[name]}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-brand-ink-muted flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Entrez le pourcentage (ex : 5 pour 5%, accepte 5,5 ou 5.5)
        </p>
      </div>

      {/* Personnalisation */}
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6 space-y-4">
        <h3 className="font-semibold text-brand-ink">Personnalisation</h3>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-ink mb-1">
              Couleur des emails
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                {...register("primaryColor")}
                disabled={!canEdit}
                className="w-10 h-10 rounded cursor-pointer border border-brand-rule"
              />
              <span className="text-sm font-mono text-brand-ink-muted">
                {primaryColor}
              </span>
            </div>
            <p className="text-xs text-brand-ink-muted mt-1">
              En-tête des emails envoyés aux clients.
            </p>
          </div>
        </div>

        {/* C-PDF-ACCENT-PAR-COMPANY : accent des devis et factures PDF.
            L'app garde son bleu ; une facture émise garde l'accent qu'elle
            avait à l'émission. */}
        <fieldset disabled={!canEdit} className="pt-2">
          <legend className="block text-sm font-medium text-brand-ink mb-1">
            Couleur des documents PDF
          </legend>
          <p className="text-xs text-brand-ink-muted mb-3">
            Numéro, libellés et total des devis et factures. Les factures déjà
            émises gardent leur couleur.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {PDF_ACCENT_KEYS.map((key) => {
              const a = pdfAccents[key];
              const selected = pdfAccent === key;
              return (
                <label
                  key={key}
                  className={`relative flex flex-col gap-2 rounded-[var(--radius-control)] border p-3 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-blue ${
                    selected
                      ? "border-brand-ink ring-1 ring-brand-ink bg-brand-paper"
                      : "border-brand-rule bg-brand-paper hover:border-brand-ink-subtle"
                  } ${!canEdit ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <input type="radio" value={key} {...register("pdfAccent")} className="sr-only" />
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-medium text-brand-ink">{a.label}</span>
                    <span
                      aria-hidden
                      className="w-4 h-4 rounded-full border border-black/10"
                      style={{ background: a.accent }}
                    />
                  </span>
                  {/* Aperçu : mêmes couleurs que sur le PDF */}
                  <span aria-hidden className="rounded-md bg-brand-cream px-2 py-1.5">
                    <span className="block font-display text-[13px] font-bold" style={{ color: a.accent }}>
                      N° F26122
                    </span>
                    <span
                      className="block text-[8px] font-medium uppercase tracking-[0.2em] mt-0.5"
                      style={{ color: a.accentInk }}
                    >
                      Total TTC
                    </span>
                  </span>
                  {key === "majorelle" && (
                    <span className="text-[10px] text-brand-ink-muted">Par défaut</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue rounded-[var(--radius-control)] text-sm font-medium text-brand-cream hover:bg-brand-ink disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Enregistrer
          </button>
          {saved && (
            <span className="text-sm text-brand-pistachio-ink font-medium">
              ✓ Paramètres sauvegardés
            </span>
          )}
        </div>
      )}
    </form>
  );
}

"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save, Lock, Upload, X } from "lucide-react";
import Image from "next/image";
import type { Company, Role } from "@/types";

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
  conditionsPaiement: z.string().min(1, "Conditions de paiement requises"),
  defaultTauxFg: z.coerce.number().min(0).max(1),
  defaultTauxMarge: z.coerce.number().min(0).max(1),
  defaultTauxCsComedien: z.coerce.number().min(0).max(1),
  defaultTauxCsTech: z.coerce.number().min(0).max(1),
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
      conditionsPaiement: company.conditionsPaiement,
      defaultTauxFg: company.defaultTauxFg,
      defaultTauxMarge: company.defaultTauxMarge,
      defaultTauxCsComedien: company.defaultTauxCsComedien,
      defaultTauxCsTech: company.defaultTauxCsTech,
    },
  });

  const primaryColor = watch("primaryColor");

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
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
    className: `w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      !canEdit ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""
    }`,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {!canEdit && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <Lock className="w-4 h-4 shrink-0" />
          Seul un administrateur peut modifier les paramètres de la société.
        </div>
      )}

      {/* Logo */}
      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900">Logo de la société</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            PNG ou JPG, max 2 Mo — affiché en haut à gauche sur tous les PDFs
          </p>
        </div>

        <div className="flex items-start gap-5">
          {/* Aperçu */}
          <div className="w-28 h-16 border border-dashed border-slate-200 rounded-lg flex items-center justify-center bg-slate-50 shrink-0 overflow-hidden">
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
              <span className="text-xs text-slate-400 text-center px-2">
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
                className={`inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors ${
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
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Supprimer le logo
                </button>
              )}

              {logoError && (
                <p className="text-red-500 text-xs">{logoError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Identité société */}
      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Identité de la société</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Raison sociale *
            </label>
            <input {...register("name")} {...fieldProps()} />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              SIRET *
            </label>
            <input
              {...register("siret")}
              {...fieldProps()}
              className={fieldProps().className + " font-mono"}
            />
            {errors.siret && (
              <p className="text-red-500 text-xs mt-1">{errors.siret.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              N° TVA intracommunautaire *
            </label>
            <input
              {...register("tvaIntra")}
              {...fieldProps()}
              className={fieldProps().className + " font-mono"}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Adresse *
            </label>
            <input {...register("address")} {...fieldProps()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Code postal
            </label>
            <input {...register("postalCode")} {...fieldProps()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ville
            </label>
            <input {...register("city")} {...fieldProps()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input {...register("email")} type="email" {...fieldProps()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Téléphone
            </label>
            <input {...register("phone")} {...fieldProps()} />
          </div>
        </div>
      </div>

      {/* Coordonnées bancaires */}
      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Coordonnées bancaires</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nom de la banque
            </label>
            <input
              {...register("nomBanque")}
              {...fieldProps()}
              placeholder="ex : BNP Paribas"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
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
              <p className="text-red-500 text-xs mt-1">{errors.iban.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
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
      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900">
            Conditions de paiement
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mention obligatoire art. L441-9 Code de commerce — apparaît sur
            toutes les factures
          </p>
        </div>
        <textarea
          {...register("conditionsPaiement")}
          rows={4}
          disabled={!canEdit}
          className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
            !canEdit ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""
          }`}
        />
      </div>

      {/* Taux par défaut */}
      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900">Taux par défaut</h3>
          <p className="text-xs text-slate-400 mt-0.5">
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
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {label}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  {...register(name)}
                  disabled={!canEdit}
                  className={`w-full pl-3 pr-7 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !canEdit
                      ? "bg-slate-50 text-slate-500 cursor-not-allowed"
                      : ""
                  }`}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                  ×
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Personnalisation */}
      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Personnalisation</h3>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Couleur principale
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                {...register("primaryColor")}
                disabled={!canEdit}
                className="w-10 h-10 rounded cursor-pointer border border-slate-200"
              />
              <span className="text-sm font-mono text-slate-500">
                {primaryColor}
              </span>
            </div>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Enregistrer
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">
              ✓ Paramètres sauvegardés
            </span>
          )}
        </div>
      )}
    </form>
  );
}

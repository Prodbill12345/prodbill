"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import type { Client } from "@/types";
import type { SireneResult } from "@/lib/sirene";
import { formatAdresseSirene } from "@/lib/sirene";
import { optionalEmailField } from "@/lib/optional-email";

const ClientSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  siret: z.string().optional(),
  tvaIntra: z.string().optional(),
  address: z.string().min(1, "Adresse requise"),
  city: z.string().default(""),
  postalCode: z.string().default(""),
  email: optionalEmailField,
  phone: z.string().optional(),
  notes: z.string().optional(),
});

type ClientFormData = z.infer<typeof ClientSchema>;

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Appelé après création réussie, avec le client renvoyé par l'API. */
  onCreated: (client: Client) => void;
}

/**
 * Modal de création de client utilisable depuis n'importe quel formulaire
 * qui a besoin de créer un client sans perdre son state (typiquement le
 * DevisBuilder). Reproduit la logique de ClientForm (SIRET + champs), mais
 * sans router.push de retour : appelle onCreated(client) puis onClose.
 */
export function ClientFormModal({ open, onClose, onCreated }: ClientFormModalProps) {
  const [siretQuery, setSiretQuery] = useState("");
  const [siretLoading, setSiretLoading] = useState(false);
  const [siretResult, setSiretResult] = useState<{
    status: "ok" | "closed" | "error";
    data?: SireneResult;
    message?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<ClientFormData>({
    resolver: zodResolver(ClientSchema) as any,
  });

  function handleClose() {
    if (submitting) return;
    reset();
    setSiretQuery("");
    setSiretResult(null);
    setSubmitError(null);
    onClose();
  }

  async function lookupSiret() {
    if (!siretQuery.trim()) return;
    setSiretLoading(true);
    setSiretResult(null);

    try {
      const res = await fetch(`/api/clients/siret/${siretQuery.replace(/\s/g, "")}`);
      const json = await res.json();

      if (res.ok) {
        const data: SireneResult = json.data;
        setSiretResult({ status: "ok", data });
        setValue("name", data.enseigne ?? data.denominationUsuelle);
        setValue("address", formatAdresseSirene(data));
        setValue("siret", data.siret);
        const addr = data.adresseEtablissement;
        setValue("postalCode", addr.codePostal ?? "");
        setValue(
          "city",
          addr.libelleCommuneEtranger ?? addr.libelleMunicipalite ?? ""
        );
      } else if (res.status === 422) {
        setSiretResult({
          status: "closed",
          data: json.data,
          message: "Cet établissement est fermé (SIRET inactif)",
        });
      } else {
        setSiretResult({ status: "error", message: "SIRET introuvable" });
      }
    } catch {
      setSiretResult({ status: "error", message: "Erreur de connexion à l'INSEE" });
    } finally {
      setSiretLoading(false);
    }
  }

  async function onSubmit(data: ClientFormData) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSubmitError(err.error ?? "Erreur lors de la création du client");
        return;
      }

      const { data: client } = (await res.json()) as { data: Client };
      onCreated(client);
      reset();
      setSiretQuery("");
      setSiretResult(null);
      onClose();
    } catch {
      setSubmitError("Erreur réseau, réessayez");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-brand-paper rounded-[var(--radius-card)] w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-rule shrink-0">
          <h2 className="text-base font-semibold text-brand-ink">
            Créer un nouveau client
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="text-brand-ink-muted hover:text-brand-ink transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <form
          id="client-form-modal"
          onSubmit={handleSubmit(onSubmit)}
          className="overflow-y-auto px-6 py-5 space-y-6 flex-1"
        >
          {/* SIRET */}
          <div className="bg-status-info-bg border border-status-info-bg rounded-[var(--radius-card)] p-4">
            <h3 className="text-sm font-semibold text-brand-ink mb-2">
              Remplissage automatique via SIRET
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={siretQuery}
                onChange={(e) => setSiretQuery(e.target.value)}
                placeholder="Ex : 12345678900012"
                className="flex-1 px-3 py-2 bg-brand-paper border border-status-info-bg rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), lookupSiret())}
              />
              <button
                type="button"
                onClick={lookupSiret}
                disabled={siretLoading || !siretQuery.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-brand-cream rounded-[var(--radius-control)] text-sm font-medium hover:bg-brand-ink disabled:opacity-50 transition-colors"
              >
                {siretLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Vérifier
              </button>
            </div>

            {siretResult && (
              <div
                className={`mt-3 flex items-start gap-2 text-sm ${
                  siretResult.status === "ok" ? "text-brand-pistachio-ink" : "text-brand-coral-ink"
                }`}
              >
                {siretResult.status === "ok" ? (
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                )}
                <span>
                  {siretResult.status === "ok"
                    ? `${siretResult.data!.denominationUsuelle} — Établissement actif`
                    : siretResult.message}
                </span>
              </div>
            )}
          </div>

          {/* Informations générales */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-brand-ink">
              Informations générales
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  Nom / Raison sociale *
                </label>
                <input
                  {...register("name")}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  placeholder="Société Dupont Productions"
                />
                {errors.name && (
                  <p className="text-brand-coral-ink text-xs mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  SIRET
                </label>
                <input
                  {...register("siret")}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  placeholder="123 456 789 00012"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  N° TVA intracommunautaire
                </label>
                <input
                  {...register("tvaIntra")}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  placeholder="FR12345678901"
                />
              </div>
            </div>
          </section>

          {/* Coordonnées */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-brand-ink">Coordonnées</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  Adresse *
                </label>
                <input
                  {...register("address")}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  placeholder="12 rue de la Paix"
                />
                {errors.address && (
                  <p className="text-brand-coral-ink text-xs mt-1">{errors.address.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  Code postal
                </label>
                <input
                  {...register("postalCode")}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  placeholder="75001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  Ville
                </label>
                <input
                  {...register("city")}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  placeholder="Paris"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  Email
                </label>
                <input
                  {...register("email")}
                  type="email"
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  placeholder="contact@societe.fr"
                />
                {errors.email && (
                  <p className="text-brand-coral-ink text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  Téléphone
                </label>
                <input
                  {...register("phone")}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  placeholder="+33 1 23 45 67 89"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  Notes internes
                </label>
                <textarea
                  {...register("notes")}
                  rows={2}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
                  placeholder="Informations complémentaires..."
                />
              </div>
            </div>
          </section>

          {submitError && (
            <div className="flex items-start gap-2 px-4 py-3 bg-status-danger-bg border border-status-danger-bg rounded-[var(--radius-control)] text-sm text-brand-coral-ink">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-brand-rule bg-brand-surface shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-brand-ink-muted hover:text-brand-ink transition-colors disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="client-form-modal"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 bg-brand-blue text-brand-cream text-sm font-medium rounded-[var(--radius-control)] hover:bg-brand-ink disabled:opacity-50 transition-colors"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Création…" : "Créer le client"}
          </button>
        </div>
      </div>
    </div>
  );
}

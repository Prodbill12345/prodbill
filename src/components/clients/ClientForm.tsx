"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import type { SireneResult } from "@/lib/sirene";
import { formatAdresseSirene } from "@/lib/sirene";

const ClientSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  siret: z.string().optional(),
  tvaIntra: z.string().optional(),
  address: z.string().min(1, "Adresse requise"),
  city: z.string().default(""),
  postalCode: z.string().default(""),
  email: z.string().email("Email invalide"),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

type ClientFormData = z.infer<typeof ClientSchema>;

export function ClientForm() {
  const router = useRouter();
  const [siretQuery, setSiretQuery] = useState("");
  const [siretLoading, setSiretLoading] = useState(false);
  const [siretResult, setSiretResult] = useState<{
    status: "ok" | "closed" | "error";
    data?: SireneResult;
    message?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<ClientFormData>({ resolver: zodResolver(ClientSchema) as any });

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
        // Pré-remplir le formulaire
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
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erreur lors de la création");
        return;
      }

      const { data: client } = await res.json();
      router.push(`/clients/${client.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
      {/* Vérification SIRET */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-blue-900 mb-3">
          Remplissage automatique via SIRET
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={siretQuery}
            onChange={(e) => setSiretQuery(e.target.value)}
            placeholder="Ex : 12345678900012"
            className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), lookupSiret())}
          />
          <button
            type="button"
            onClick={lookupSiret}
            disabled={siretLoading || !siretQuery.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
              siretResult.status === "ok"
                ? "text-green-700"
                : "text-red-700"
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
      <section className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Informations générales</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nom / Raison sociale *
            </label>
            <input
              {...register("name")}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Société Dupont Productions"
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              SIRET
            </label>
            <input
              {...register("siret")}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123 456 789 00012"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              N° TVA intracommunautaire
            </label>
            <input
              {...register("tvaIntra")}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="FR12345678901"
            />
          </div>
        </div>
      </section>

      {/* Coordonnées */}
      <section className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Coordonnées</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Adresse *
            </label>
            <input
              {...register("address")}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="12 rue de la Paix"
            />
            {errors.address && (
              <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Code postal
            </label>
            <input
              {...register("postalCode")}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="75001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ville
            </label>
            <input
              {...register("city")}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paris"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email *
            </label>
            <input
              {...register("email")}
              type="email"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="contact@societe.fr"
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Téléphone
            </label>
            <input
              {...register("phone")}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+33 1 23 45 67 89"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes internes
            </label>
            <textarea
              {...register("notes")}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Informations complémentaires..."
            />
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Créer le client
        </button>
      </div>
    </form>
  );
}

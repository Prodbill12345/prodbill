"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Building2, ChevronRight, ChevronLeft, Check } from "lucide-react";

const OnboardingSchema = z.object({
  companyName: z.string().min(1, "Nom de société requis"),
  siret: z.string().optional(),
  tvaIntra: z.string().optional(),
  address: z.string().min(1, "Adresse requise"),
  city: z.string().default(""),
  postalCode: z.string().default(""),
  email: z.string().email("Email invalide"),
  phone: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
});

type OnboardingData = z.infer<typeof OnboardingSchema>;

const STEPS = [
  { id: 1, label: "Société", description: "Identité légale" },
  { id: 2, label: "Coordonnées", description: "Contact & adresse" },
  { id: 3, label: "Banque", description: "Coordonnées bancaires" },
];

export function OnboardingForm({ userName }: { userName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<OnboardingData>({ resolver: zodResolver(OnboardingSchema) as any });

  async function nextStep() {
    const fieldsToValidate: (keyof OnboardingData)[][] = [
      ["companyName", "siret", "tvaIntra"],
      ["address", "city", "postalCode", "email", "phone"],
      ["iban", "bic"],
    ];
    const valid = await trigger(fieldsToValidate[step - 1]);
    if (valid) setStep((s) => s + 1);
  }

  async function onSubmit(data: OnboardingData) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Une erreur est survenue");
        return;
      }

      // Forcer un refresh complet pour que le layout recharge le User
      window.location.href = "/";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Bienvenue, {userName} 👋
          </h1>
          <p className="text-slate-500 mt-2">
            Configurons votre espace ProdBill en 3 minutes
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                    step > s.id
                      ? "bg-green-500 text-white"
                      : step === s.id
                      ? "bg-blue-600 text-white ring-4 ring-blue-100"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {step > s.id ? <Check className="w-4 h-4" /> : s.id}
                </div>
                <span
                  className={`text-xs mt-1 font-medium ${
                    step === s.id ? "text-blue-600" : "text-slate-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-16 h-0.5 mx-2 mb-4 transition-all ${
                    step > s.id ? "bg-green-400" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Step 1 — Identité société */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Identité de votre société
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Ces informations apparaîtront sur vos devis et factures
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Raison sociale *
                  </label>
                  <input
                    {...register("companyName")}
                    autoFocus
                    placeholder="Ex : Studio Lumière Productions SAS"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                  {errors.companyName && (
                    <p className="text-red-500 text-xs mt-1">{errors.companyName.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      SIRET
                    </label>
                    <input
                      {...register("siret")}
                      placeholder="123 456 789 00012"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                    {errors.siret && (
                      <p className="text-red-500 text-xs mt-1">{errors.siret.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      N° TVA intracommunautaire
                    </label>
                    <input
                      {...register("tvaIntra")}
                      placeholder="FR12345678901"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                  💡 Ces informations peuvent être complétées ou modifiées plus tard dans
                  les Paramètres.
                </p>
              </div>
            )}

            {/* Step 2 — Coordonnées */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Coordonnées
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Adresse et contact de votre société
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Adresse *
                  </label>
                  <input
                    {...register("address")}
                    autoFocus
                    placeholder="12 rue de la Paix"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                  {errors.address && (
                    <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Code postal
                    </label>
                    <input
                      {...register("postalCode")}
                      placeholder="75001"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Ville
                    </label>
                    <input
                      {...register("city")}
                      placeholder="Paris"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Email de facturation *
                    </label>
                    <input
                      {...register("email")}
                      type="email"
                      placeholder="compta@studio.fr"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                    {errors.email && (
                      <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Téléphone
                    </label>
                    <input
                      {...register("phone")}
                      placeholder="+33 1 23 45 67 89"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 — Banque */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Coordonnées bancaires
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Apparaissent sur vos factures pour faciliter le virement
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    IBAN
                  </label>
                  <input
                    {...register("iban")}
                    autoFocus
                    placeholder="FR76 3000 6000 0112 3456 7890 189"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    BIC / SWIFT
                  </label>
                  <input
                    {...register("bic")}
                    placeholder="BNPAFRPP"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>

                <p className="text-xs text-slate-400 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                  🔒 Ces données sont stockées de manière sécurisée et ne sont jamais
                  partagées. Vous pouvez les ajouter plus tard dans les Paramètres.
                </p>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Retour
                </button>
              ) : (
                <div />
              )}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  Suivant
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Créer mon espace
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          ProdBill — Facturation audiovisuelle professionnelle
        </p>
      </div>
    </div>
  );
}

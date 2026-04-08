"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Loader2, BookmarkPlus, X, Users, CheckCircle2 } from "lucide-react";
import { calculerDevis, calculerLigne } from "@/lib/calculations";
import { TotauxPanel } from "./TotauxPanel";
import { LIGNE_TAG_LABELS, LIGNE_TAG_COLORS } from "@/types";
import type { Client } from "@/types";

const TAGS = ["ARTISTE", "TECHNICIEN_HCS", "STUDIO", "MUSIQUE"] as const;

const LigneSchema = z.object({
  libelle: z.string().min(1, "Libellé requis"),
  // AGENT inclus pour la validation de type — le dropdown utilisateur n'expose pas AGENT
  tag: z.enum(["ARTISTE", "TECHNICIEN_HCS", "STUDIO", "MUSIQUE", "AGENT"]),
  quantite: z.coerce.number().positive("Quantité > 0"),
  prixUnit: z.coerce.number().min(0, "Prix ≥ 0"),
});

const SectionSchema = z.object({
  titre: z.string().min(1, "Titre requis"),
  lignes: z.array(LigneSchema),
});

const DevisFormSchema = z.object({
  clientId: z.string().min(1, "Client requis"),
  objet: z.string().min(1, "Objet requis"),
  tauxCsComedien: z.coerce.number().min(0).max(1),
  tauxCsTech: z.coerce.number().min(0).max(1),
  tauxFg: z.coerce.number().min(0).max(1),
  tauxMarge: z.coerce.number().min(0).max(1),
  dateValidite: z.string().optional(),
  notes: z.string().optional(),
  remise: z.coerce.number().min(0).optional(),
  sections: z.array(SectionSchema).min(1, "Au moins une section"),
});

type DevisFormData = z.infer<typeof DevisFormSchema>;

interface DevisInitialData {
  clientId: string;
  objet: string;
  tauxCsComedien: number;
  tauxCsTech: number;
  tauxFg: number;
  tauxMarge: number;
  dateValidite?: string | null;
  notes?: string | null;
  remise?: number | null;
  sections: {
    titre: string;
    lignes: {
      libelle: string;
      tag: "ARTISTE" | "TECHNICIEN_HCS" | "STUDIO" | "MUSIQUE" | "AGENT";
      quantite: number;
      prixUnit: number;
    }[];
  }[];
}

interface DevisBuilderProps {
  clients: Client[];
  defaultTaux: {
    tauxCsComedien: number;
    tauxCsTech: number;
    tauxFg: number;
    tauxMarge: number;
  };
  /** Présent en mode édition */
  devisId?: string;
  initialData?: DevisInitialData;
}

export function DevisBuilder({ clients, defaultTaux, devisId, initialData }: DevisBuilderProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateShared, setTemplateShared] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(initialData ? initialData.sections.map((_, i) => i) : [0])
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DevisFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(DevisFormSchema) as any,
    defaultValues: initialData
      ? {
          clientId: initialData.clientId,
          objet: initialData.objet,
          tauxCsComedien: initialData.tauxCsComedien,
          tauxCsTech: initialData.tauxCsTech,
          tauxFg: initialData.tauxFg,
          tauxMarge: initialData.tauxMarge,
          dateValidite: initialData.dateValidite ?? undefined,
          notes: initialData.notes ?? undefined,
          remise: initialData.remise ?? undefined,
          sections: initialData.sections,
        }
      : {
          tauxCsComedien: defaultTaux.tauxCsComedien,
          tauxCsTech: defaultTaux.tauxCsTech,
          tauxFg: defaultTaux.tauxFg,
          tauxMarge: defaultTaux.tauxMarge,
          sections: [{ titre: "", lignes: [] }],
        },
  });

  const {
    fields: sectionFields,
    append: appendSection,
    remove: removeSection,
  } = useFieldArray({ control, name: "sections" });

  const watchedValues = watch();

  // Calcul temps réel
  const allLignes = watchedValues.sections?.flatMap((s) =>
    (s.lignes ?? []).map((l) => ({
      tag: l.tag ?? "ARTISTE",
      quantite: Number(l.quantite) || 0,
      prixUnit: Number(l.prixUnit) || 0,
    }))
  ) ?? [];

  const taux = {
    tauxCsComedien: Number(watchedValues.tauxCsComedien) || defaultTaux.tauxCsComedien,
    tauxCsTech: Number(watchedValues.tauxCsTech) || defaultTaux.tauxCsTech,
    tauxFg: Number(watchedValues.tauxFg) || defaultTaux.tauxFg,
    tauxMarge: Number(watchedValues.tauxMarge) || defaultTaux.tauxMarge,
  };

  const remiseValue = Number(watchedValues.remise) || 0;
  const calculResult = calculerDevis(allLignes, taux, remiseValue);

  const toggleSection = useCallback((idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const sections = (watchedValues.sections ?? []).map((s, si) => ({
        titre: s.titre ?? "",
        lignes: (s.lignes ?? []).map((l, li) => ({
          libelle: l.libelle ?? "",
          tag: l.tag ?? "ARTISTE",
          quantite: Number(l.quantite) || 0,
          prixUnit: Number(l.prixUnit) || 0,
          ordre: li,
        })),
      }));

      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDesc.trim() || undefined,
          isShared: templateShared,
          tauxCsComedien: Number(watchedValues.tauxCsComedien) || defaultTaux.tauxCsComedien,
          tauxCsTech: Number(watchedValues.tauxCsTech) || defaultTaux.tauxCsTech,
          tauxFg: Number(watchedValues.tauxFg) || defaultTaux.tauxFg,
          tauxMarge: Number(watchedValues.tauxMarge) || defaultTaux.tauxMarge,
          sections,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erreur lors de l'enregistrement");
        return;
      }

      setShowTemplateModal(false);
      setTemplateName("");
      setTemplateDesc("");
      setTemplateShared(false);
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 3000);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function onSubmit(data: DevisFormData) {
    setSubmitting(true);
    try {
      const sections = data.sections.map((s, si) => ({
        ...s,
        ordre: si,
        lignes: s.lignes.map((l, li) => ({
          ...l,
          quantite: Number(l.quantite),
          prixUnit: Number(l.prixUnit),
          ordre: li,
        })),
      }));

      if (devisId) {
        // Mode édition — PUT
        const res = await fetch(`/api/devis/${devisId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, sections }),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error ?? "Erreur");
          return;
        }
        router.push(`/devis/${devisId}`);
        router.refresh();
      } else {
        // Mode création — POST
        const res = await fetch("/api/devis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, sections }),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error ?? "Erreur");
          return;
        }
        const { data: devis } = await res.json();
        router.push(`/devis/${devis.id}`);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} onKeyDown={handleKeyDown} className="grid grid-cols-3 gap-6">
      {/* Colonne principale (2/3) */}
      <div className="col-span-2 space-y-5">
        {/* En-tête du devis */}
        <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-4">
          <h3 className="font-semibold text-slate-900">Informations générales</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Client *
              </label>
              {(() => {
                const clientIdField = register("clientId");
                return (
                  <select
                    {...clientIdField}
                    onChange={(e) => {
                      if (e.target.value === "__nouveau__") {
                        router.push("/clients/nouveau?redirect=devis");
                        return;
                      }
                      clientIdField.onChange(e);
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Sélectionner un client...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option disabled>──────────────</option>
                    <option value="__nouveau__">+ Créer un nouveau client</option>
                  </select>
                );
              })()}
              {errors.clientId && (
                <p className="text-red-500 text-xs mt-1">{errors.clientId.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Validité jusqu&apos;au
              </label>
              <input
                type="date"
                {...register("dateValidite")}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Objet du devis *
              </label>
              <input
                {...register("objet")}
                placeholder="Ex : Production du spot TV Marque X"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.objet && (
                <p className="text-red-500 text-xs mt-1">{errors.objet.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Taux */}
        <div className="bg-white rounded-xl border border-slate-100 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Taux appliqués</h3>
          <div className="grid grid-cols-4 gap-3">
            {[
              { name: "tauxCsComedien" as const, label: "CS Comédiens" },
              { name: "tauxCsTech" as const, label: "CS Techniciens" },
              { name: "tauxFg" as const, label: "Frais généraux" },
              { name: "tauxMarge" as const, label: "Marge" },
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
                    className="w-full pl-3 pr-7 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                    ×
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Saisir en décimal : 0.57 = 57%, 0.05 = 5%
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {sectionFields.map((sField, si) => (
            <SectionBlock
              key={sField.id}
              sectionIndex={si}
              control={control}
              register={register}
              setValue={setValue}
              errors={errors}
              isExpanded={expandedSections.has(si)}
              onToggle={() => toggleSection(si)}
              onRemove={() => removeSection(si)}
              canRemove={sectionFields.length > 1}
              watchedLignes={watchedValues.sections?.[si]?.lignes ?? []}
            />
          ))}

          <button
            type="button"
            onClick={() =>
              appendSection({ titre: "", lignes: [] })
            }
            className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Ajouter une section
          </button>
        </div>

        {/* Remise exceptionnelle */}
        <div className="bg-white rounded-xl border border-slate-100 p-6">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Remise exceptionnelle
          </label>
          <p className="text-xs text-slate-400 mb-3">Montant déduit du Total HT — TVA et TTC recalculés</p>
          <div className="flex items-center gap-2 max-w-xs">
            <input
              {...register("remise")}
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-500 shrink-0">€</span>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-slate-100 p-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Notes / Conditions particulières
          </label>
          <textarea
            {...register("notes")}
            rows={4}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Conditions particulières, délais, informations complémentaires..."
          />
        </div>

        {/* Sauvegarder comme modèle */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition-colors"
          >
            <BookmarkPlus className="w-4 h-4" />
            Sauvegarder comme modèle
          </button>
          {templateSaved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Modèle enregistré
            </span>
          )}
        </div>
      </div>

      {/* Modal — Sauvegarder comme modèle */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Sauvegarder comme modèle</h2>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-500">
              La structure des sections et lignes sera sauvegardée <strong>sans les prix</strong>.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nom du modèle *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Ex : Spot TV 30s avec comédien"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description <span className="text-slate-400 font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="Décrivez les cas d'usage de ce modèle..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={templateShared}
                  onChange={(e) => setTemplateShared(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    Partager avec mon équipe
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Visible par tous les membres de votre société
                  </p>
                </div>
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || savingTemplate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Colonne droite — Totaux (1/3) */}
      <div className="space-y-4">
        <TotauxPanel result={calculResult} taux={taux} />

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 rounded-xl text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          {devisId ? "Enregistrer les modifications" : "Enregistrer le devis"}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────
// SectionBlock
// ─────────────────────────────────────────────

interface SectionBlockProps {
  sectionIndex: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  canRemove: boolean;
  watchedLignes: Partial<z.infer<typeof LigneSchema>>[];
}

function SectionBlock({
  sectionIndex,
  control,
  register,
  setValue,
  errors,
  isExpanded,
  onToggle,
  onRemove,
  canRemove,
  watchedLignes,
}: SectionBlockProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `sections.${sectionIndex}.lignes`,
  });

  // ── Agent Voix Off ───────────────────────────────────────────────────────────
  // Set des field.id (stables) des lignes ARTISTE sélectionnées comme sources
  const [selectedForAgent, setSelectedForAgent] = useState<Set<string>>(new Set());

  const agentIdx = watchedLignes.findIndex((l) => l?.tag === "AGENT");
  const agentEnabled = agentIdx !== -1;

  // Lignes ARTISTE candidates (hors ligne AGENT elle-même)
  const sourceFields = fields
    .map((f, i) => ({
      id: f.id,
      ligne: watchedLignes[i] ?? ({} as Partial<z.infer<typeof LigneSchema>>),
      idx: i,
    }))
    .filter(({ idx, ligne }) =>
      idx !== agentIdx && ligne.tag === "ARTISTE"
    );

  // Total des lignes sources sélectionnées
  const selectedSourceTotal = sourceFields
    .filter(({ id }) => selectedForAgent.has(id))
    .reduce((s, { ligne }) => s + (Number(ligne.quantite) || 0) * (Number(ligne.prixUnit) || 0), 0);

  const agentPrix = Math.round(selectedSourceTotal * 0.1 * 100) / 100;

  // Synchronise le prixUnit de la ligne AGENT avec le calcul en temps réel
  useEffect(() => {
    if (agentIdx === -1) return;
    setValue(`sections.${sectionIndex}.lignes.${agentIdx}.prixUnit`, agentPrix);
  }, [agentPrix, agentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quand les lignes sources changent (ajout/suppression/changement de tag) :
  // — ajoute automatiquement les nouvelles lignes ARTISTE à la sélection
  // — retire les ids qui ne correspondent plus à une ligne ARTISTE
  const sourceIdsKey = sourceFields.map((f) => f.id).join(",");
  useEffect(() => {
    if (agentIdx === -1) return;
    setSelectedForAgent((prev) => {
      const currentIds = new Set(sourceFields.map((f) => f.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (currentIds.has(id)) next.add(id); });
      currentIds.forEach((id) => { if (!prev.has(id)) next.add(id); }); // auto-sélection nouveaux
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [sourceIdsKey, agentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  function addAgentLine() {
    setSelectedForAgent(new Set(sourceFields.map((f) => f.id)));
    const prix = Math.round(
      sourceFields.reduce(
        (s, { ligne }) => s + (Number(ligne.quantite) || 0) * (Number(ligne.prixUnit) || 0),
        0
      ) * 0.1 * 100
    ) / 100;
    append({ libelle: "Agent Voix Off (10%)", tag: "AGENT", quantite: 1, prixUnit: prix });
  }

  function removeLigne(i: number) {
    const fieldId = fields[i]?.id;
    if (fieldId && selectedForAgent.has(fieldId)) {
      setSelectedForAgent((prev) => {
        const next = new Set(prev);
        next.delete(fieldId);
        return next;
      });
    }
    remove(i);
  }
  const sectionTotal = watchedLignes.reduce(
    (s, l) => s + (Number(l?.quantite) || 0) * (Number(l?.prixUnit) || 0),
    0
  );

  const fmtEur = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      {/* En-tête section */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-50">
        <GripVertical className="w-4 h-4 text-slate-300 cursor-grab" />
        <input
          {...register(`sections.${sectionIndex}.titre`)}
          className="flex-1 font-semibold text-slate-900 bg-transparent focus:outline-none focus:ring-0 placeholder:text-slate-400 text-sm"
          placeholder="Titre de la section"
        />
        <span className="text-sm font-medium text-slate-500 tabular-nums">
          {fmtEur(sectionTotal)}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-2">
          {/* En-tête colonnes */}
          {fields.length > 0 && (
            <div className="grid grid-cols-[1fr_120px_80px_80px_80px_32px] gap-2 px-2 mb-1">
              <span className="text-xs text-slate-400 font-medium">
                Libellé
                {agentEnabled && sourceFields.length > 0 && (
                  <span className="ml-2 text-amber-400 font-normal">✓ sélection agent</span>
                )}
              </span>
              <span className="text-xs text-slate-400 font-medium">Tag</span>
              <span className="text-xs text-slate-400 font-medium text-right">Qté</span>
              <span className="text-xs text-slate-400 font-medium text-right">P.U. HT</span>
              <span className="text-xs text-slate-400 font-medium text-right">Total</span>
              <span />
            </div>
          )}

          {/* Lignes */}
          {fields.map((field, li) => {
            const ligne = watchedLignes[li] ?? {};
            const qty = Number(ligne.quantite) || 0;
            const pu = Number(ligne.prixUnit) || 0;
            const total = calculerLigne(qty, pu);
            const tagValue = ligne.tag ?? "ARTISTE";
            const isAgentLine = tagValue === "AGENT";
            const isSourceLine =
              agentEnabled && tagValue === "ARTISTE";
            // ── Ligne AGENT : affichage spécial, champs en hidden ──────────────
            if (isAgentLine) {
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-[1fr_120px_80px_80px_80px_32px] gap-2 items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-2"
                >
                  {/* hidden inputs pour que react-hook-form conserve les valeurs */}
                  <input type="hidden" {...register(`sections.${sectionIndex}.lignes.${li}.libelle`)} />
                  <input type="hidden" {...register(`sections.${sectionIndex}.lignes.${li}.tag`)} />
                  <input type="hidden" {...register(`sections.${sectionIndex}.lignes.${li}.quantite`)} />
                  <input type="hidden" {...register(`sections.${sectionIndex}.lignes.${li}.prixUnit`)} />
                  <span className="text-sm text-amber-800 font-medium truncate px-0.5">
                    {ligne.libelle || "Agent Voix Off (10%)"}
                  </span>
                  <span className="inline-flex items-center justify-center bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5 rounded-full">
                    Agent (10%)
                  </span>
                  <span className="text-sm text-right tabular-nums text-amber-600">1</span>
                  <span className="text-sm text-right tabular-nums text-amber-800 font-semibold">
                    {new Intl.NumberFormat("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(pu)}{" €"}
                  </span>
                  <span className="text-sm text-right tabular-nums text-amber-800 font-semibold">
                    {new Intl.NumberFormat("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(total)}{" €"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLigne(li)}
                    className="text-amber-300 hover:text-red-500 transition-colors flex items-center justify-center"
                    title="Retirer la ligne Agent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            // ── Ligne normale ──────────────────────────────────────────────────
            return (
              <div
                key={field.id}
                className="grid grid-cols-[1fr_120px_80px_80px_80px_32px] gap-2 items-center"
              >
                {/* Libellé — avec checkbox agent si applicable */}
                <div className="flex items-center gap-1.5 min-w-0">
                  {isSourceLine ? (
                    <input
                      type="checkbox"
                      checked={selectedForAgent.has(field.id)}
                      onChange={(e) =>
                        setSelectedForAgent((prev) => {
                          const next = new Set(prev);
                          e.target.checked ? next.add(field.id) : next.delete(field.id);
                          return next;
                        })
                      }
                      className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-amber-500"
                      title="Inclure dans le calcul Agent Voix Off"
                    />
                  ) : (
                    /* espace réservé pour aligner avec les lignes ayant une checkbox */
                    agentEnabled && <span className="w-3.5 shrink-0" />
                  )}
                  <input
                    {...register(`sections.${sectionIndex}.lignes.${li}.libelle`)}
                    placeholder="Description de la prestation"
                    className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Controller
                  control={control}
                  name={`sections.${sectionIndex}.lignes.${li}.tag`}
                  defaultValue="ARTISTE"
                  render={({ field: f }) => (
                    <select
                      {...f}
                      className={`px-2 py-1.5 border rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        LIGNE_TAG_COLORS[f.value as keyof typeof LIGNE_TAG_COLORS] ??
                        "border-slate-200"
                      }`}
                    >
                      {TAGS.map((t) => (
                        <option key={t} value={t}>
                          {LIGNE_TAG_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  )}
                />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  {...register(`sections.${sectionIndex}.lignes.${li}.quantite`)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register(`sections.${sectionIndex}.lignes.${li}.prixUnit`)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-right tabular-nums text-slate-600 font-medium">
                  {total === 0 ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    new Intl.NumberFormat("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(total)
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeLigne(li)}
                  className="text-slate-200 hover:text-red-500 transition-colors flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {/* Bouton ajouter une ligne normale */}
          <button
            type="button"
            onClick={() => append({ libelle: "", tag: "ARTISTE", quantite: 1, prixUnit: 0 })}
            className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700 mt-2 px-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter une ligne
          </button>

          {/* Bouton Agent Voix Off — visible dès qu'il y a des lignes ARTISTE et pas encore de ligne AGENT */}
          {sourceFields.length > 0 && !agentEnabled && (
            <button
              type="button"
              onClick={addAgentLine}
              className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-900 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors mt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter Agent Voix Off (10%)
              <span className="text-xs text-amber-400 font-mono">= {fmtEur(agentPrix)}</span>
            </button>
          )}

          {/* Résumé quand l'agent est actif */}
          {agentEnabled && sourceFields.length > 0 && (
            <p className="text-xs text-amber-500 px-1 mt-0.5">
              Agent calculé sur{" "}
              <span className="font-medium">{selectedForAgent.size} ligne{selectedForAgent.size > 1 ? "s" : ""}</span>{" "}
              cochée{selectedForAgent.size > 1 ? "s" : ""} ({fmtEur(selectedSourceTotal)}) → {fmtEur(agentPrix)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

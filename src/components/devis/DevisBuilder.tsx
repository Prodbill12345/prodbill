"use client";

import { useState, useCallback, useEffect, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Loader2, BookmarkPlus, X, Users, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { calculerDevis, calculerLigne } from "@/lib/calculations";
import { TotauxPanel } from "./TotauxPanel";
import { LIGNE_TAG_LABELS, LIGNE_TAG_COLORS } from "@/types";
import type { Client } from "@/types";
import { InputPct } from "@/components/forms/InputPct";
import { parsePctInput, decimalToPct, pctToDecimal } from "@/lib/parse-pct";
import {
  periodeExploitationFields,
  validatePeriodeExploitation,
} from "@/lib/zod-helpers";
import { ClientFormModal } from "@/components/clients/ClientFormModal";
import { BdcClientUploadField } from "./BdcClientUploadField";
import { sortByLabelFr } from "@/lib/sort-by-name";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SECTIONS_REORDER_BLOCKED_MESSAGE,
  buildSectionsPayload,
  moveIndexSet,
} from "@/lib/devis-sections";

// Convention : la DB stocke les taux en DÉCIMAL (0..1). Le form state
// les manipule en POURCENTAGE (0..100). Conversions :
//  - Au mount  : decimalToPct(initialData.tauxX ?? defaultTaux.tauxX)
//  - Au submit : pctToDecimal(formData.tauxX)
//  - Au calcul live : pctToDecimal(parsePctInput(watched.tauxX) ?? defaultTauxPct)

const TAGS = ["ARTISTE", "TECHNICIEN_HCS", "STUDIO", "MUSIQUE"] as const;

const LigneSchema = z.object({
  libelle: z.string().min(1, "Libellé requis"),
  // AGENT inclus pour la validation de type — le dropdown utilisateur n'expose pas AGENT
  tag: z.enum(["ARTISTE", "TECHNICIEN_HCS", "STUDIO", "MUSIQUE", "AGENT"]),
  quantite: z.coerce.number().positive("Quantité > 0"),
  prixUnit: z.coerce.number().min(0, "Prix ≥ 0"),
  tauxIndexation: z.coerce.number().min(0).max(100).optional(),
  comedienId: z.string().optional(),
  agentId: z.string().optional(),
  horsMarge: z.boolean().optional(),
  horsCS: z.boolean().optional(),
});

const SectionSchema = z.object({
  // Id de la DevisSection en base (mode édition) : sert à la route PUT pour
  // détecter un réordonnancement (C-DEVIS-SECTIONS-REORDER). Absent pour une
  // section nouvelle.
  sourceId: z.string().optional(),
  titre: z.string().default(""),
  lignes: z.array(LigneSchema),
});

const DevisFormSchema = z.object({
  clientId: z.string().min(1, "Client requis"),
  objet: z.string().min(1, "Objet requis"),
  description: z.string().optional(),
  nomProjet: z.string().optional(),
  refDevis: z.string().optional(),
  annee: z.coerce.number().int().min(2000).max(2100).optional(),
  // Pourcentages (0..100) côté UI — converti en décimal au submit
  tauxCsComedien: z.coerce.number().min(0).max(100),
  tauxCsTech: z.coerce.number().min(0).max(100),
  tauxFg: z.coerce.number().min(0).max(100),
  tauxMarge: z.coerce.number().min(0).max(100),
  // TVA : pourcentage entier (20, 10, 5.5, 0 typiquement). Coerce parce
  // que le <select> envoie une string.
  tauxTva: z.coerce.number().min(0).max(100),
  // Mention légale TVA — pertinent seulement si tauxTva=0
  tvaMention: z.string().optional(),
  dateEmission: z.string().optional(),
  dateValidite: z.string().optional(),
  dateSeance: z.string().optional(),
  ...periodeExploitationFields,
  notes: z.string().optional(),
  remise: z.coerce.number().min(0).optional(),
  sections: z.array(SectionSchema).min(1, "Au moins une section"),
}).superRefine(validatePeriodeExploitation);

type DevisFormData = z.infer<typeof DevisFormSchema>;

/**
 * Lit le corps JSON d'une réponse 4xx/5xx et formate un message utile :
 *   - { error: "...", details: [{path: [...], message: "..."}] } (Zod)
 *     → "Données invalides : sections[0].titre — Required, ..."
 *   - { error: "..." } → "..."
 * TODO Sprint 3 : remplacer par un toast propre avec scroll vers le champ.
 */
async function formatErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const base = body?.error ?? `HTTP ${res.status}`;
    if (Array.isArray(body?.details) && body.details.length > 0) {
      const issues = (body.details as Array<{ path: (string | number)[]; message: string }>)
        .slice(0, 5)
        .map((i) => `${(i.path ?? []).join(".") || "(root)"} — ${i.message}`)
        .join("\n• ");
      return `${base} :\n• ${issues}${body.details.length > 5 ? `\n…et ${body.details.length - 5} autres` : ""}`;
    }
    return base;
  } catch {
    return `Erreur HTTP ${res.status}`;
  }
}

interface DevisInitialData {
  clientId: string;
  objet: string;
  description?: string | null;
  nomProjet?: string | null;
  refDevis?: string | null;
  annee?: number | null;
  tauxCsComedien: number;
  tauxCsTech: number;
  tauxFg: number;
  tauxMarge: number;
  tauxTva?: number;
  tvaMention?: string | null;
  dateEmission?: string | null;
  dateValidite?: string | null;
  dateSeance?: string | null;
  periodeExploitationDebut?: string | null;
  periodeExploitationFin?: string | null;
  periodeExploitationLibelle?: string | null;
  notes?: string | null;
  remise?: number | null;
  // BDC reçu DU client (uploadé séparément des champs form). Ticket #79.
  bdcClientUrl?: string | null;
  bdcClientFilename?: string | null;
  bdcClientUploadedAt?: string | null;
  sections: {
    sourceId?: string;
    titre: string;
    lignes: {
      libelle: string;
      tag: "ARTISTE" | "TECHNICIEN_HCS" | "STUDIO" | "MUSIQUE" | "AGENT";
      quantite: number;
      prixUnit: number;
      tauxIndexation?: number;
      comedienId?: string | null;
      agentId?: string | null;
      horsMarge?: boolean;
      horsCS?: boolean;
    }[];
  }[];
}

interface AgentRef {
  id: string;
  nom: string;
  prenom?: string | null;
  agence?: string | null;
}

interface ComedienRef {
  id: string;
  prenom: string;
  nom: string;
}

interface DevisBuilderProps {
  clients: Client[];
  agents?: AgentRef[];
  comediens?: ComedienRef[];
  defaultTaux: {
    tauxCsComedien: number;
    tauxCsTech: number;
    tauxFg: number;
    tauxMarge: number;
  };
  /** Présent en mode édition */
  devisId?: string;
  initialData?: DevisInitialData;
  /**
   * True si le devis est un import historique Caleson non encore
   * réparé (cf. `src/lib/historical-import.ts` + BUG #4). Déclenche
   * l'affichage du banner orange en haut du formulaire.
   */
  historicalImportWarning?: boolean;
  /**
   * True si une facture (mono ou récap) est liée au devis : les sections ne
   * peuvent plus être réordonnées (même règle que le changement de client,
   * cf. src/lib/devis-sections.ts).
   */
  sectionsReorderLocked?: boolean;
}

export function DevisBuilder({
  clients: initialClients,
  agents = [],
  comediens = [],
  defaultTaux,
  devisId,
  initialData,
  historicalImportWarning = false,
  sectionsReorderLocked = false,
}: DevisBuilderProps) {
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
  // Liste des clients en local : on l'enrichit quand l'utilisateur crée
  // un client via le modal, sans recharger la page (sinon le state du
  // formulaire de devis serait perdu).
  const [clients, setClients] = useState<Client[]>(initialClients);

  // Listes déroulantes triées par ordre alphabétique français (localeCompare).
  // Recalculées si la liste change (ex : création d'un client via le modal).
  const sortedClients = useMemo(
    () => sortByLabelFr(clients, (c) => c.name),
    [clients]
  );
  const sortedAgents = useMemo(
    () => sortByLabelFr(agents, (a) => (a.prenom ? `${a.prenom} ${a.nom}` : a.nom)),
    [agents]
  );
  const sortedComediens = useMemo(
    () => sortByLabelFr(comediens, (c) => `${c.prenom} ${c.nom}`),
    [comediens]
  );
  const [showClientModal, setShowClientModal] = useState(false);

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
          description: initialData.description ?? undefined,
          nomProjet: initialData.nomProjet ?? undefined,
          refDevis: initialData.refDevis ?? undefined,
          annee: initialData.annee ?? undefined,
          tauxCsComedien: decimalToPct(initialData.tauxCsComedien),
          tauxCsTech: decimalToPct(initialData.tauxCsTech),
          tauxFg: decimalToPct(initialData.tauxFg),
          tauxMarge: decimalToPct(initialData.tauxMarge),
          tauxTva: initialData.tauxTva ?? 20,
          tvaMention: initialData.tvaMention ?? undefined,
          dateEmission: initialData.dateEmission ?? undefined,
          dateValidite: initialData.dateValidite ?? undefined,
          dateSeance: initialData.dateSeance ?? undefined,
          periodeExploitationDebut: initialData.periodeExploitationDebut ?? undefined,
          periodeExploitationFin: initialData.periodeExploitationFin ?? undefined,
          periodeExploitationLibelle: initialData.periodeExploitationLibelle ?? undefined,
          notes: initialData.notes ?? undefined,
          remise: initialData.remise ?? undefined,
          sections: initialData.sections.map((s) => ({
            ...s,
            lignes: s.lignes.map((l) => ({
              ...l,
              comedienId: l.comedienId ?? undefined,
              agentId: l.agentId ?? undefined,
            })),
          })),
        }
      : {
          tauxCsComedien: decimalToPct(defaultTaux.tauxCsComedien),
          tauxCsTech: decimalToPct(defaultTaux.tauxCsTech),
          tauxFg: decimalToPct(defaultTaux.tauxFg),
          tauxMarge: decimalToPct(defaultTaux.tauxMarge),
          tauxTva: 20,
          // Pré-remplit la date d'émission à aujourd'hui pour les nouveaux
          // devis. Vanda peut la modifier (cas typique : devis du 1er du
          // mois saisi le 3).
          dateEmission: new Date().toISOString().slice(0, 10),
          notes: "Conditions de paiement : Paiement à 45 jours. Pénalités de retard : 15% par an exigibles à 45 jours. Indemnité forfaitaire de recouvrement : 40 € (art. D. 441-6 C. com.)",
          sections: [{ titre: "", lignes: [] }],
        },
  });

  const {
    fields: sectionFields,
    append: appendSection,
    remove: removeSection,
    move: moveSection,
  } = useFieldArray({ control, name: "sections" });

  // Réordonnancement des sections (C-DEVIS-SECTIONS-REORDER) : poignée seule
  // (souris / tactile après 4 px, pour ne pas gêner le clic) et clavier
  // (Espace pour saisir, flèches, Espace pour poser). L'ordre affiché devient
  // `ordre` au submit (buildSectionsPayload).
  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleSectionDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = sectionFields.findIndex((f) => f.id === active.id);
    const to = sectionFields.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    moveSection(from, to);
    setExpandedSections((prev) => moveIndexSet(prev, sectionFields.length, from, to));
  }

  const sectionPosition = (id: string | number) =>
    sectionFields.findIndex((f) => f.id === id) + 1;
  const sectionAnnouncements: Announcements = {
    onDragStart: ({ active }) =>
      `Section ${sectionPosition(active.id)} saisie. Flèches pour déplacer, Espace pour poser, Échap pour annuler.`,
    onDragOver: ({ over }) =>
      over ? `Position ${sectionPosition(over.id)} sur ${sectionFields.length}.` : undefined,
    onDragEnd: ({ over }) =>
      over ? `Section posée en position ${sectionPosition(over.id)}.` : "Section reposée.",
    onDragCancel: () => "Déplacement annulé.",
  };

  const watchedValues = watch();

  // Calcul temps réel
  const allLignes = watchedValues.sections?.flatMap((s) =>
    (s.lignes ?? []).map((l) => ({
      tag: l.tag ?? "ARTISTE",
      quantite: Number(l.quantite) || 0,
      prixUnit: Number(l.prixUnit) || 0,
      tauxIndexation: Number(l.tauxIndexation) || 0,
      horsMarge: Boolean(l.horsMarge),
      horsCS: Boolean(l.horsCS),
    }))
  ) ?? [];

  // Live compute : form state en %, calculerDevis attend des décimaux.
  // parsePctInput retourne null si la saisie est vide/invalide → on
  // retombe alors sur le défaut Company (converti en %).
  const taux = {
    tauxCsComedien: pctToDecimal(parsePctInput(watchedValues.tauxCsComedien) ?? decimalToPct(defaultTaux.tauxCsComedien)),
    tauxCsTech:     pctToDecimal(parsePctInput(watchedValues.tauxCsTech)     ?? decimalToPct(defaultTaux.tauxCsTech)),
    tauxFg:         pctToDecimal(parsePctInput(watchedValues.tauxFg)         ?? decimalToPct(defaultTaux.tauxFg)),
    tauxMarge:      pctToDecimal(parsePctInput(watchedValues.tauxMarge)      ?? decimalToPct(defaultTaux.tauxMarge)),
  };

  const remiseValue = Number(watchedValues.remise) || 0;
  // BUG-TVA-TAUX-IGNORE : le taux TVA sélectionné (%) DOIT être passé à
  // calculerDevis, sinon le récap live retombe sur le défaut 20 %.
  const tauxTvaPct = Number.isFinite(Number(watchedValues.tauxTva))
    ? Number(watchedValues.tauxTva)
    : 20;
  const calculResult = calculerDevis(allLignes, taux, remiseValue, tauxTvaPct);

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
          tauxIndexation: Number(l.tauxIndexation) || 0,
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
          // Template stocke les taux en DÉCIMAL (cohérent avec la DB)
          tauxCsComedien: pctToDecimal(parsePctInput(watchedValues.tauxCsComedien) ?? decimalToPct(defaultTaux.tauxCsComedien)),
          tauxCsTech:     pctToDecimal(parsePctInput(watchedValues.tauxCsTech)     ?? decimalToPct(defaultTaux.tauxCsTech)),
          tauxFg:         pctToDecimal(parsePctInput(watchedValues.tauxFg)         ?? decimalToPct(defaultTaux.tauxFg)),
          tauxMarge:      pctToDecimal(parsePctInput(watchedValues.tauxMarge)      ?? decimalToPct(defaultTaux.tauxMarge)),
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
      // ordre = position affichée (sections réordonnables par glisser-déposer).
      const sections = buildSectionsPayload(data.sections);

      // Conversion UI (%) → API (décimal) avant POST/PUT
      const payload = {
        ...data,
        tauxCsComedien: pctToDecimal(data.tauxCsComedien),
        tauxCsTech: pctToDecimal(data.tauxCsTech),
        tauxFg: pctToDecimal(data.tauxFg),
        tauxMarge: pctToDecimal(data.tauxMarge),
        sections,
      };

      if (devisId) {
        // Mode édition — PUT
        const res = await fetch(`/api/devis/${devisId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          alert(await formatErrorMessage(res));
          return;
        }
        router.push(`/devis/${devisId}`);
        router.refresh();
      } else {
        // Mode création — POST
        const res = await fetch("/api/devis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          alert(await formatErrorMessage(res));
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
    <>
    <form onSubmit={handleSubmit(onSubmit)} onKeyDown={handleKeyDown} className="grid grid-cols-3 gap-6">
      {/* Garde-fou : devis Caleson import historique non encore réparé.
          Voir src/lib/historical-import.ts + BUG #4. Non bloquant. */}
      {historicalImportWarning && (
        <div className="col-span-3 sticky top-0 z-30 bg-status-partial-bg border border-status-partial-bg rounded-[var(--radius-card)] px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="w-5 h-5 text-brand-ink shrink-0 mt-0.5"
              strokeWidth={2}
            />
            <div className="flex-1 text-sm text-brand-ink">
              <p className="font-semibold mb-1">
                Devis issu de l&apos;import historique
              </p>
              <p className="text-brand-ink leading-relaxed">
                Ce devis a été importé depuis votre ancien système et n&apos;a
                jamais été modifié depuis. Ses composantes FG / Marge peuvent
                ne pas correspondre aux taux affichés. Avant toute
                modification :
              </p>
              <ul className="list-disc ml-5 mt-2 space-y-0.5 text-brand-ink">
                <li>
                  Vérifie que les taux FG et Marge correspondent bien au PDF
                  d&apos;origine
                </li>
                <li>
                  Si non, contacte le support pour rectifier en base
                </li>
                <li>
                  En attendant, <strong>ne pas enregistrer</strong> pour
                  éviter de corrompre les totaux du devis
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Colonne principale (2/3) */}
      <div className="col-span-2 space-y-5">
        {/* En-tête du devis */}
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6 space-y-4">
          <h3 className="font-semibold text-brand-ink">Informations générales</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Client *
              </label>
              {(() => {
                const clientIdField = register("clientId");
                return (
                  <select
                    {...clientIdField}
                    onChange={(e) => {
                      if (e.target.value === "__nouveau__") {
                        // Ouverture en modal pour ne pas perdre le state
                        // du devis en cours (bug #78). Reset à "" pour
                        // que le <select> ne reste pas bloqué sur la
                        // valeur sentinelle pendant que le modal est
                        // ouvert.
                        setShowClientModal(true);
                        e.target.value = "";
                        return;
                      }
                      clientIdField.onChange(e);
                    }}
                    className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-brand-paper"
                  >
                    <option value="">Sélectionner un client...</option>
                    {sortedClients.map((c) => (
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
                <p className="text-brand-coral-ink text-xs mt-1">{errors.clientId.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Date d&apos;émission
              </label>
              <input
                type="date"
                {...register("dateEmission")}
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Validité jusqu&apos;au
              </label>
              <input
                type="date"
                {...register("dateValidite")}
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Date de la séance
              </label>
              <input
                type="date"
                {...register("dateSeance")}
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>

            {/* Période d'exploitation (ticket #69). Sous-section dédiée
                en col-span-2 avec 3 inputs en grille interne (stack mobile). */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Période d&apos;exploitation
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <input
                    type="date"
                    {...register("periodeExploitationDebut")}
                    min="1900-01-01"
                    max="2100-12-31"
                    placeholder="Du"
                    aria-label="Date de début d'exploitation"
                    className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                  <p className="text-xs text-brand-ink-muted mt-0.5">Du</p>
                  {"periodeExploitationDebut" in errors && errors.periodeExploitationDebut && (
                    <p className="text-brand-coral-ink text-xs mt-1">
                      {errors.periodeExploitationDebut.message as string}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="date"
                    {...register("periodeExploitationFin")}
                    min="1900-01-01"
                    max="2100-12-31"
                    placeholder="Au"
                    aria-label="Date de fin d'exploitation"
                    className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                  <p className="text-xs text-brand-ink-muted mt-0.5">Au</p>
                  {"periodeExploitationFin" in errors && errors.periodeExploitationFin && (
                    <p className="text-brand-coral-ink text-xs mt-1">
                      {errors.periodeExploitationFin.message as string}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="text"
                    {...register("periodeExploitationLibelle")}
                    placeholder="Libellé (ex: Web Global + TV France)"
                    maxLength={255}
                    aria-label="Libellé de la période d'exploitation"
                    className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                  <p className="text-xs text-brand-ink-muted mt-0.5">Libellé (optionnel)</p>
                </div>
              </div>
              <p className="text-xs text-brand-ink-muted mt-1.5">
                Optionnel — durée pendant laquelle le client peut exploiter la production.
              </p>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Objet du devis *
              </label>
              <input
                {...register("objet")}
                placeholder="Ex : Production du spot TV Marque X"
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
              {errors.objet && (
                <p className="text-brand-coral-ink text-xs mt-1">{errors.objet.message}</p>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Description du projet
              </label>
              <textarea
                {...register("description")}
                rows={3}
                placeholder="Décrivez le projet, le contexte, les détails importants..."
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
              />
            </div>

            {/* Champs d'identification */}
            <div>
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Nom du projet
              </label>
              <input
                {...register("nomProjet")}
                placeholder="Ex : Campagne TV Été 2025"
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Numéro de devis
              </label>
              <input
                {...register("refDevis")}
                placeholder="Ex : DEV-2025-001"
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-ink mb-1">
                Année
              </label>
              <select
                {...register("annee")}
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-brand-paper"
              >
                <option value="">—</option>
                {[2023, 2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* BDC client reçu — upload séparé du form (side-effect direct).
                Affiché uniquement en mode édition : avant le 1er save, le
                devis n'a pas encore d'id et la route /api/devis/[id]/bdc-client
                ne pourrait pas y rattacher le fichier. Ticket #79. */}
            {devisId && (
              <div className="col-span-2">
                <BdcClientUploadField
                  devisId={devisId}
                  initial={{
                    url: initialData?.bdcClientUrl ?? null,
                    filename: initialData?.bdcClientFilename ?? null,
                    uploadedAt: initialData?.bdcClientUploadedAt ?? null,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Taux */}
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6">
          <h3 className="font-semibold text-brand-ink mb-4">Taux appliqués</h3>
          <div className="grid grid-cols-5 gap-3">
            {[
              { name: "tauxCsComedien" as const, label: "CS Comédiens" },
              { name: "tauxCsTech" as const, label: "CS Techniciens" },
              { name: "tauxFg" as const, label: "Frais généraux" },
              { name: "tauxMarge" as const, label: "Marge" },
            ].map(({ name, label }) => (
              <div key={name}>
                <label className="block text-xs font-medium text-brand-ink-muted mb-1">
                  {label}
                </label>
                <InputPct
                  {...register(name, {
                    setValueAs: (v) => parsePctInput(v) ?? 0,
                  })}
                  invalid={!!errors[name]}
                />
              </div>
            ))}
            {/* TVA — dropdown (taux fixes, pas un input libre). Préserve la
                valeur courante si non-standard via une 5e option dynamique. */}
            <div>
              <label className="block text-xs font-medium text-brand-ink-muted mb-1">
                TVA
              </label>
              <TvaDropdown
                value={watchedValues.tauxTva ?? 20}
                onChange={(v) => setValue("tauxTva", v, { shouldDirty: true })}
              />
            </div>
          </div>
          <p className="text-xs text-brand-ink-muted mt-2 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Entrez le pourcentage (ex : 5 pour 5%, accepte 5,5 ou 5.5)
          </p>

          {/* Mention TVA conditionnelle — affichée UNIQUEMENT si TVA=0 */}
          {Number(watchedValues.tauxTva) === 0 && (
            <div className="mt-4 pt-4 border-t border-brand-rule">
              <label className="block text-xs font-medium text-brand-ink-muted mb-1">
                Mention TVA (affichée sur le PDF)
              </label>
              <input
                type="text"
                {...register("tvaMention")}
                placeholder="Art. 293 B du CGI"
                className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
              <p className="text-xs text-brand-ink-muted mt-1">
                Par défaut : <code className="bg-brand-surface px-1 rounded">Art. 293 B du CGI</code> (franchise en base).
                Modifiable : étranger UE = <code className="bg-brand-surface px-1 rounded">Art. 196 directive 2006/112/CE</code>, etc.
              </p>
            </div>
          )}
        </div>

        {/* Sections */}
        <div className="space-y-3">
          <DndContext
            id="devis-sections-dnd"
            sensors={sectionSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
            accessibility={{
              announcements: sectionAnnouncements,
              screenReaderInstructions: {
                draggable:
                  "Pour déplacer la section, appuyez sur Espace, utilisez les flèches haut et bas, puis Espace pour poser ou Échap pour annuler.",
              },
            }}
          >
          <SortableContext
            items={sectionFields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
            disabled={sectionsReorderLocked}
          >
          {sectionFields.map((sField, si) => (
            <SectionBlock
              key={sField.id}
              sortableId={sField.id}
              reorderLocked={sectionsReorderLocked}
              canReorder={sectionFields.length > 1}
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
              agents={sortedAgents}
              comediens={sortedComediens}
            />
          ))}
          </SortableContext>
          </DndContext>

          <button
            type="button"
            onClick={() =>
              appendSection({ titre: "", lignes: [] })
            }
            className="w-full py-3 border-2 border-dashed border-brand-rule rounded-[var(--radius-card)] text-sm text-brand-ink-muted hover:border-status-info-bg hover:text-brand-blue transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Ajouter une section
          </button>
        </div>

        {/* Remise exceptionnelle */}
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6">
          <label className="block text-sm font-medium text-brand-ink mb-1">
            Remise exceptionnelle
          </label>
          <p className="text-xs text-brand-ink-muted mb-3">Montant déduit du Total HT — TVA et TTC recalculés</p>
          <div className="flex items-center gap-2 max-w-xs">
            <input
              {...register("remise")}
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <span className="text-sm text-brand-ink-muted shrink-0">€</span>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-6">
          <label className="block text-sm font-medium text-brand-ink mb-2">
            Notes / Conditions particulières
          </label>
          <textarea
            {...register("notes")}
            rows={4}
            className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
            placeholder="Conditions particulières, délais, informations complémentaires..."
          />
        </div>

        {/* Sauvegarder comme modèle */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-2 text-sm text-brand-ink-muted hover:text-brand-blue transition-colors"
          >
            <BookmarkPlus className="w-4 h-4" />
            Sauvegarder comme modèle
          </button>
          {templateSaved && (
            <span className="flex items-center gap-1.5 text-sm text-brand-pistachio-ink font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Modèle enregistré
            </span>
          )}
        </div>
      </div>

      {/* Modal — Sauvegarder comme modèle */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 backdrop-blur-sm">
          <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule w-full max-w-md mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-ink">Sauvegarder comme modèle</h2>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-brand-ink-muted hover:text-brand-ink transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-brand-ink-muted">
              La structure des sections et lignes sera sauvegardée <strong>sans les prix</strong>.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  Nom du modèle *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Ex : Spot TV 30s avec comédien"
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-ink mb-1">
                  Description <span className="text-brand-ink-muted font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="Décrivez les cas d'usage de ce modèle..."
                  rows={3}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={templateShared}
                  onChange={(e) => setTemplateShared(e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-blue"
                />
                <div>
                  <span className="text-sm font-medium text-brand-ink flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-brand-ink-muted" />
                    Partager avec mon équipe
                  </span>
                  <p className="text-xs text-brand-ink-muted mt-0.5">
                    Visible par tous les membres de votre société
                  </p>
                </div>
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="flex-1 px-4 py-2.5 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink-muted hover:bg-brand-surface transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || savingTemplate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-blue rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream hover:bg-brand-ink disabled:opacity-50 transition-colors"
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
        <TotauxPanel result={calculResult} taux={taux} tauxTva={tauxTvaPct} />

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-blue rounded-[var(--radius-card)] text-sm font-semibold text-brand-cream hover:bg-brand-ink disabled:opacity-50 transition-colors"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          {devisId ? "Enregistrer les modifications" : "Enregistrer le devis"}
        </button>
      </div>
    </form>
    <ClientFormModal
      open={showClientModal}
      onClose={() => setShowClientModal(false)}
      onCreated={(client) => {
        setClients((prev) => [...prev, client]);
        setValue("clientId", client.id, { shouldDirty: true, shouldValidate: true });
        // Best-effort : revalide la liste clients côté server components
        // (page /clients et autres consommateurs) pour rester synchro.
        router.refresh();
      }}
    />
    </>
  );
}

// ─────────────────────────────────────────────
// SectionBlock
// ─────────────────────────────────────────────

interface SectionBlockProps {
  /** Clé useFieldArray de la section : identifiant pour le tri dnd-kit. */
  sortableId: string;
  /** Facture liée : poignée désactivée (SECTIONS_REORDER_BLOCKED_MESSAGE). */
  reorderLocked: boolean;
  /** Une seule section : rien à réordonner. */
  canReorder: boolean;
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
  agents: AgentRef[];
  comediens: ComedienRef[];
}

function SectionBlock({
  sortableId,
  reorderLocked,
  canReorder,
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
  agents,
  comediens,
}: SectionBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId, disabled: reorderLocked || !canReorder });
  const sortableStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const { fields, append, remove } = useFieldArray({
    control,
    name: `sections.${sectionIndex}.lignes`,
  });

  // Abonnement direct sur chaque path tauxIndexation (valeur scalaire → subscription garantie)
  // useWatch sur un tableau de paths scalaires se déclenche dès qu'un seul change.
  // Contrairement à useWatch sur l'array entière, pas de problème de référence stable.
  const tauxIndexationsLive = useWatch({
    control,
    name: fields.map((_, i) => `sections.${sectionIndex}.lignes.${i}.tauxIndexation` as const),
  }) as (number | string | undefined)[];

  // ── Indexation annuelle ──────────────────────────────────────────────────────
  // Set des field.id des lignes ARTISTE/MUSIQUE avec indexation activée
  const [indexedLineIds, setIndexedLineIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    fields.forEach((f, i) => {
      if ((Number(watchedLignes[i]?.tauxIndexation) || 0) > 0) ids.add(f.id);
    });
    return ids;
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
      tauxIndexation: Number(tauxIndexationsLive[i]) || 0,
      idx: i,
    }))
    .filter(({ idx, ligne }) =>
      idx !== agentIdx && ligne.tag === "ARTISTE"
    );

  // Total des lignes sources sélectionnées (base + indexation annuelle)
  // tauxIndexation vient de useWatch par path scalaire — garanti à jour
  const selectedSourceTotal = sourceFields
    .filter(({ id }) => selectedForAgent.has(id))
    .reduce((s, { ligne, tauxIndexation }) => {
      const base = (Number(ligne.quantite) || 0) * (Number(ligne.prixUnit) || 0);
      const indexation = base * (tauxIndexation / 100);
      return s + base + indexation;
    }, 0);

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
      sourceFields.reduce((s, { ligne, tauxIndexation }) => {
        const base = (Number(ligne.quantite) || 0) * (Number(ligne.prixUnit) || 0);
        const indexation = base * (tauxIndexation / 100);
        return s + base + indexation;
      }, 0) * 0.1 * 100
    ) / 100;
    append({ libelle: "Agent Voix Off (10%)", tag: "AGENT", quantite: 1, prixUnit: prix });
  }

  function removeLigne(i: number) {
    const fieldId = fields[i]?.id;
    if (fieldId) {
      if (selectedForAgent.has(fieldId)) {
        setSelectedForAgent((prev) => { const n = new Set(prev); n.delete(fieldId); return n; });
      }
      setIndexedLineIds((prev) => { const n = new Set(prev); n.delete(fieldId); return n; });
    }
    remove(i);
  }
  const sectionTotal = watchedLignes.reduce((s, l, i) => {
    const base = (Number(l?.quantite) || 0) * (Number(l?.prixUnit) || 0);
    const indexation = base * ((Number(tauxIndexationsLive[i]) || 0) / 100);
    return s + base + indexation;
  }, 0);

  const fmtEur = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

  return (
    <div
      ref={setSortableRef}
      style={sortableStyle}
      className={`bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-hidden ${
        isDragging ? "relative z-10 shadow-[0_8px_24px_rgba(37,37,31,0.12)]" : ""
      }`}
    >
      {/* En-tête section */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-brand-rule">
        {/* Poignée de déplacement : seule zone qui démarre le glisser-déposer
            (titre et montants restent éditables). */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...(reorderLocked || !canReorder ? {} : attributes)}
          {...(reorderLocked || !canReorder ? {} : listeners)}
          disabled={reorderLocked || !canReorder}
          aria-label={reorderLocked ? SECTIONS_REORDER_BLOCKED_MESSAGE : "Déplacer la section"}
          title={reorderLocked ? SECTIONS_REORDER_BLOCKED_MESSAGE : "Déplacer la section"}
          className="-ml-1 p-1 rounded-[6px] text-brand-ink-subtle touch-none enabled:cursor-grab enabled:hover:text-brand-ink enabled:hover:bg-brand-surface enabled:active:cursor-grabbing disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-brand-blue"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <input
          {...register(`sections.${sectionIndex}.titre`)}
          className="flex-1 font-semibold text-brand-ink bg-transparent focus:outline-none focus:ring-0 placeholder:text-brand-ink-muted text-sm"
          placeholder="Titre de la section"
        />
        <span className="text-sm font-medium text-brand-ink-muted tabular-nums">
          {fmtEur(sectionTotal)}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-brand-ink-subtle hover:text-brand-coral transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="text-brand-ink-muted hover:text-brand-ink transition-colors"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-2">
          {/* En-tête colonnes */}
          {fields.length > 0 && (
            <div className="grid grid-cols-[1fr_120px_80px_80px_80px_32px] gap-2 px-2 mb-1">
              <span className="text-xs text-brand-ink-muted font-medium">
                Libellé
                {agentEnabled && sourceFields.length > 0 && (
                  <span className="ml-2 text-brand-coral font-normal">✓ sélection agent</span>
                )}
              </span>
              <span className="text-xs text-brand-ink-muted font-medium">Tag</span>
              <span className="text-xs text-brand-ink-muted font-medium text-right">Qté</span>
              <span className="text-xs text-brand-ink-muted font-medium text-right">P.U. HT</span>
              <span className="text-xs text-brand-ink-muted font-medium text-right">Total</span>
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
                  className="grid grid-cols-[1fr_120px_80px_80px_80px_32px] gap-2 items-center rounded-[var(--radius-control)] border border-status-partial-bg bg-status-partial-bg px-2 py-2"
                >
                  {/* hidden inputs pour que react-hook-form conserve les valeurs */}
                  <input type="hidden" {...register(`sections.${sectionIndex}.lignes.${li}.libelle`)} />
                  <input type="hidden" {...register(`sections.${sectionIndex}.lignes.${li}.tag`)} />
                  <input type="hidden" {...register(`sections.${sectionIndex}.lignes.${li}.quantite`)} />
                  <input type="hidden" {...register(`sections.${sectionIndex}.lignes.${li}.prixUnit`)} />
                  <span className="text-sm text-brand-ink font-medium truncate px-0.5">
                    {ligne.libelle || "Agent Voix Off (10%)"}
                  </span>
                  <span className="inline-flex items-center justify-center bg-status-partial-bg text-brand-ink text-xs font-medium px-2 py-0.5 rounded-full">
                    Agent (10%)
                  </span>
                  <span className="text-sm text-right tabular-nums text-brand-ink">1</span>
                  <span className="text-sm text-right tabular-nums text-brand-ink font-semibold">
                    {new Intl.NumberFormat("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(pu)}{" €"}
                  </span>
                  <span className="text-sm text-right tabular-nums text-brand-ink font-semibold">
                    {new Intl.NumberFormat("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(total)}{" €"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLigne(li)}
                    className="text-brand-coral hover:text-brand-coral transition-colors flex items-center justify-center"
                    title="Retirer la ligne Agent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            // ── Ligne normale ──────────────────────────────────────────────────
            const isIndexable = tagValue === "ARTISTE" || tagValue === "MUSIQUE";
            const indexationMontant = Math.round(total * (Number(ligne.tauxIndexation) || 0) / 100 * 100) / 100;
            return (
              <Fragment key={field.id}>
              <div
                className="grid grid-cols-[1fr_120px_80px_80px_80px_32px] gap-2 items-center"
              >
                {/* Libellé — avec checkbox agent si applicable */}
                <div className="flex flex-col gap-0.5 min-w-0">
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
                        className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-brand-blue"
                        title="Inclure dans le calcul Agent Voix Off"
                      />
                    ) : (
                      /* espace réservé pour aligner avec les lignes ayant une checkbox */
                      agentEnabled && <span className="w-3.5 shrink-0" />
                    )}
                    <input
                      {...register(`sections.${sectionIndex}.lignes.${li}.libelle`)}
                      placeholder="Description de la prestation"
                      className="flex-1 min-w-0 px-2.5 py-1.5 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    />
                    {/* Toggle horsMarge — exclut la ligne du calcul Marge/FG.
                        Discret par défaut, orange quand activé. Tickets #66-68. */}
                    <label
                      className="flex items-center gap-1 shrink-0 cursor-pointer select-none group"
                      title="Exclure cette ligne du calcul Marge / Frais Généraux (la ligne reste facturée dans le HT). Utile pour les prestations Musique que vous ne souhaitez pas surfacturer."
                    >
                      <input
                        type="checkbox"
                        {...register(`sections.${sectionIndex}.lignes.${li}.horsMarge`)}
                        className="w-3 h-3 cursor-pointer accent-brand-coral shrink-0"
                      />
                      <span
                        className={`text-[10px] uppercase font-medium tracking-wide whitespace-nowrap ${
                          ligne.horsMarge
                            ? "text-brand-coral-ink"
                            : "text-brand-ink-subtle group-hover:text-brand-ink-muted"
                        }`}
                      >
                        hors marge
                      </span>
                    </label>
                    {/* Toggle horsCS — exclut la ligne de la base des charges
                        sociales. Affiché uniquement sur les tags qui PORTENT
                        une base CS (ARTISTE, TECHNICIEN_HCS) : sur STUDIO /
                        MUSIQUE / AGENT la case n'aurait aucun effet et ferait
                        croire le contraire. FEAT-LIGNE-HORS-CS (Vanda). */}
                    {(tagValue === "ARTISTE" || tagValue === "TECHNICIEN_HCS") && (
                      <label
                        className="flex items-center gap-1 shrink-0 cursor-pointer select-none group"
                        title={
                          tagValue === "ARTISTE"
                            ? "Décocher les charges sociales sur cette ligne : elle reste facturée dans le HT mais ne porte aucune CS comédien. Utile quand l'artiste facture lui-même (société, auto-entrepreneur)."
                            : "Décocher les charges sociales sur cette ligne : elle reste facturée dans le HT mais ne porte aucune CS technicien. Attention : la part de CS disparaissant de la base, les FG et la Marge baissent aussi."
                        }
                      >
                        <input
                          type="checkbox"
                          {...register(`sections.${sectionIndex}.lignes.${li}.horsCS`)}
                          className="w-3 h-3 cursor-pointer accent-brand-ink shrink-0"
                        />
                        <span
                          className={`text-[10px] uppercase font-medium tracking-wide whitespace-nowrap ${
                            ligne.horsCS
                              ? "text-brand-coral-ink"
                              : "text-brand-ink-subtle group-hover:text-brand-ink-muted"
                          }`}
                        >
                          hors cs
                        </span>
                      </label>
                    )}
                  </div>
                  {tagValue === "ARTISTE" && comediens.length > 0 && (
                    <select
                      {...register(`sections.${sectionIndex}.lignes.${li}.comedienId`)}
                      className="ml-5 px-2 py-0.5 border border-brand-rule rounded-md text-xs text-brand-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-blue bg-brand-surface"
                    >
                      <option value="">Comédien (optionnel)</option>
                      {comediens.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.prenom} {c.nom}
                        </option>
                      ))}
                    </select>
                  )}
                  {tagValue === "ARTISTE" && agents.length > 0 && (
                    <select
                      {...register(`sections.${sectionIndex}.lignes.${li}.agentId`)}
                      className="ml-5 px-2 py-0.5 border border-brand-rule rounded-md text-xs text-brand-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-blue bg-brand-surface"
                    >
                      <option value="">Associer un agent (optionnel)</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.prenom ? `${a.prenom} ${a.nom}` : a.nom}{a.agence ? ` — ${a.agence}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <Controller
                  control={control}
                  name={`sections.${sectionIndex}.lignes.${li}.tag`}
                  defaultValue="ARTISTE"
                  render={({ field: f }) => (
                    <select
                      {...f}
                      className={`px-2 py-1.5 border rounded-[var(--radius-control)] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-blue ${
                        LIGNE_TAG_COLORS[f.value as keyof typeof LIGNE_TAG_COLORS] ??
                        "border-brand-rule"
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
                  /*
                    step="any" : Vanda facture des fractions d'heure (0,25 /
                    0,75 / 1,5…). Un step fixe faisait rejeter la saisie par la
                    validation native du navigateur. La borne « > 0 » est
                    portée par le schéma zod (client + serveur).
                  */
                  step="any"
                  min="0"
                  {...register(`sections.${sectionIndex}.lignes.${li}.quantite`)}
                  className="px-2 py-1.5 border border-brand-rule rounded-[var(--radius-control)] text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register(`sections.${sectionIndex}.lignes.${li}.prixUnit`)}
                  className="px-2 py-1.5 border border-brand-rule rounded-[var(--radius-control)] text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
                <span className="text-sm text-right tabular-nums text-brand-ink-muted font-medium">
                  {/*
                    Affiche "0,00 €" si l'utilisateur a explicitement saisi
                    une valeur (y compris 0 — cas "ligne offerte" Réalisation,
                    cf. Vanda ligne #75). N'affiche "—" QUE si le P.U. est
                    encore vide/non saisi pour ne pas polluer la saisie initiale.
                  */}
                  {(() => {
                    const puRaw = ligne.prixUnit as unknown;
                    const puHasValue =
                      puRaw !== undefined && puRaw !== null && puRaw !== "";
                    return puHasValue ? (
                      new Intl.NumberFormat("fr-FR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(total)
                    ) : (
                      <span className="text-brand-ink-subtle">—</span>
                    );
                  })()}
                </span>
                <button
                  type="button"
                  onClick={() => removeLigne(li)}
                  className="text-brand-ink-subtle hover:text-brand-coral transition-colors flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* ── Indexation annuelle (ARTISTE / MUSIQUE seulement) ── */}
              {isIndexable && (
                indexedLineIds.has(field.id) ? (
                  <div className="grid grid-cols-[1fr_120px_80px_80px_80px_32px] gap-2 items-center ml-1 pl-3 border-l-2 border-brand-rule -mt-0.5 pb-0.5">
                    <span className="text-xs text-brand-ink-muted font-medium">
                      {tagValue === "ARTISTE" ? "Indexation annuelle artiste" : "Indexation annuelle musique"}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        {...register(`sections.${sectionIndex}.lignes.${li}.tauxIndexation`)}
                        className="w-16 px-2 py-1 border border-brand-rule rounded-[var(--radius-control)] text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-blue"
                      />
                      <span className="text-xs text-brand-ink-muted">%</span>
                    </div>
                    <span />{/* Qté */}
                    <span />{/* P.U. */}
                    <span className="text-xs text-right tabular-nums text-brand-ink-muted font-medium">
                      {indexationMontant === 0
                        ? <span className="text-brand-ink-subtle">—</span>
                        : fmtEur(indexationMontant)
                      }
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setValue(`sections.${sectionIndex}.lignes.${li}.tauxIndexation`, 0);
                        setIndexedLineIds((prev) => { const n = new Set(prev); n.delete(field.id); return n; });
                      }}
                      className="text-brand-ink-muted hover:text-brand-coral transition-colors flex items-center justify-center"
                      title="Retirer l'indexation"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIndexedLineIds((prev) => { const n = new Set(prev); n.add(field.id); return n; })}
                    className="flex items-center gap-1 text-xs text-brand-ink-muted hover:text-brand-ink ml-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {tagValue === "ARTISTE" ? "Indexation annuelle artiste" : "Indexation annuelle musique"}
                  </button>
                )
              )}
              </Fragment>
            );
          })}

          {/* Bouton ajouter une ligne normale */}
          <button
            type="button"
            onClick={() => append({ libelle: "", tag: "ARTISTE", quantite: 1, prixUnit: 0 })}
            className="flex items-center gap-1.5 text-sm text-brand-blue hover:text-brand-blue mt-2 px-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter une ligne
          </button>

          {/* Bouton Agent Voix Off — visible dès qu'il y a des lignes ARTISTE et pas encore de ligne AGENT */}
          {sourceFields.length > 0 && !agentEnabled && (
            <button
              type="button"
              onClick={addAgentLine}
              className="flex items-center gap-2 text-sm text-brand-ink hover:text-brand-ink px-3 py-1.5 rounded-[var(--radius-control)] border border-status-partial-bg bg-status-partial-bg hover:border-brand-ink-subtle transition-colors mt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter Agent Voix Off (10%)
              <span className="text-xs text-brand-coral font-mono">= {fmtEur(agentPrix)}</span>
            </button>
          )}

          {/* Résumé quand l'agent est actif */}
          {agentEnabled && sourceFields.length > 0 && (
            <p className="text-xs text-brand-coral px-1 mt-0.5">
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


const STANDARD_TVA = [20, 10, 5.5, 0] as const;

/**
 * Dropdown TVA — 4 taux standard + 5e option dynamique "Autre (X%)" si
 * la valeur courante est non-standard. Permet d'ouvrir un devis avec un
 * taux hérité d'un import historique (ex 16.67%, 26.67% sur Caleson)
 * sans le corrompre silencieusement.
 */
function TvaDropdown({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const numValue = Number(value);
  const isStandard = (STANDARD_TVA as readonly number[]).includes(numValue);
  return (
    <select
      value={String(numValue)}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full px-2 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm bg-brand-paper focus:outline-none focus:ring-2 focus:ring-brand-blue"
    >
      <option value="20">20 %</option>
      <option value="10">10 %</option>
      <option value="5.5">5,5 %</option>
      <option value="0">Non applicable</option>
      {!isStandard && (
        <option value={String(numValue)}>
          Autre ({numValue} %)
        </option>
      )}
    </select>
  );
}

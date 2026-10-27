"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, LayoutTemplate, Users, Trash2, CheckCircle2 } from "lucide-react";
import { DevisBuilder } from "./DevisBuilder";
import type { Client } from "@/types";

type TemplateLigne = {
  libelle: string;
  tag: "ARTISTE" | "TECHNICIEN_HCS" | "STUDIO" | "MUSIQUE" | "AGENT";
  quantite: number;
  prixUnit: number;
  tauxIndexation: number;
  ordre: number;
};

type TemplateSection = {
  titre: string;
  lignes: TemplateLigne[];
};

type DevisTemplate = {
  id: string;
  name: string;
  description: string | null;
  sections: unknown;
  tauxCsComedien: number;
  tauxCsTech: number;
  tauxFg: number;
  tauxMarge: number;
  isShared: boolean;
  userId: string;
  createdAt: string;
  user: { name: string };
};

interface AgentRef { id: string; nom: string; prenom?: string | null; agence?: string | null; }
interface ComedienRef { id: string; prenom: string; nom: string; }

interface NouveauDevisClientProps {
  clients: Client[];
  agents: AgentRef[];
  comediens: ComedienRef[];
  defaultTaux: {
    tauxCsComedien: number;
    tauxCsTech: number;
    tauxFg: number;
    tauxMarge: number;
  };
  templates: DevisTemplate[];
}

export function NouveauDevisClient({ clients, agents, comediens, defaultTaux, templates }: NouveauDevisClientProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<DevisTemplate | null>(null);

  function applyTemplate(tpl: DevisTemplate) {
    setActiveTemplate(tpl);
    setShowPicker(false);
  }

  function clearTemplate() {
    setActiveTemplate(null);
  }

  // Convert template → initialData (sections with prices)
  const initialData = activeTemplate
    ? {
        clientId: "",
        objet: "",
        tauxCsComedien: activeTemplate.tauxCsComedien,
        tauxCsTech: activeTemplate.tauxCsTech,
        tauxFg: activeTemplate.tauxFg,
        tauxMarge: activeTemplate.tauxMarge,
        sections: (activeTemplate.sections as TemplateSection[]).map((s) => ({
          titre: s.titre,
          lignes: s.lignes.map((l) => ({
            libelle: l.libelle,
            tag: l.tag,
            quantite: l.quantite,
            prixUnit: l.prixUnit,
            tauxIndexation: l.tauxIndexation,
          })),
        })),
      }
    : undefined;

  const myTemplates = templates.filter((t) => !t.isShared);
  const sharedTemplates = templates.filter((t) => t.isShared);

  return (
    <div className="space-y-4">
      {/* Template picker trigger */}
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-brand-ink hover:bg-brand-surface transition-colors"
          >
            <span className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-brand-ink-muted" />
              Partir d&apos;un modèle
              {activeTemplate && (
                <span className="ml-2 flex items-center gap-1 text-xs font-semibold text-brand-pistachio-ink bg-status-success-bg px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  {activeTemplate.name}
                </span>
              )}
            </span>
            {showPicker ? (
              <ChevronUp className="w-4 h-4 text-brand-ink-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-brand-ink-muted" />
            )}
          </button>

          {showPicker && (
            <div className="border-t border-brand-rule p-4 space-y-4">
              {activeTemplate && (
                <div className="flex items-center justify-between bg-status-success-bg border border-status-success-bg rounded-[var(--radius-control)] px-4 py-2.5">
                  <p className="text-sm text-brand-pistachio-ink font-medium">
                    Modèle actif : <span className="font-bold">{activeTemplate.name}</span>
                  </p>
                  <button
                    type="button"
                    onClick={clearTemplate}
                    className="text-brand-pistachio-ink hover:text-brand-coral transition-colors"
                    title="Retirer le modèle"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {myTemplates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-brand-ink-muted uppercase tracking-wider mb-2">
                    Mes modèles
                  </p>
                  <div className="grid gap-2">
                    {myTemplates.map((tpl) => (
                      <TemplateCard
                        key={tpl.id}
                        tpl={tpl}
                        isActive={activeTemplate?.id === tpl.id}
                        onSelect={() => applyTemplate(tpl)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {sharedTemplates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-brand-ink-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    Partagés par l&apos;équipe
                  </p>
                  <div className="grid gap-2">
                    {sharedTemplates.map((tpl) => (
                      <TemplateCard
                        key={tpl.id}
                        tpl={tpl}
                        isActive={activeTemplate?.id === tpl.id}
                        onSelect={() => applyTemplate(tpl)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {templates.length === 0 && (
                <p className="text-sm text-brand-ink-muted text-center py-3">
                  Aucun modèle disponible. Créez votre premier modèle depuis un devis.
                </p>
              )}
            </div>
          )}
        </div>

      {/* DevisBuilder — remounted when template changes via key */}
      <DevisBuilder
        key={activeTemplate?.id ?? "blank"}
        clients={clients}
        agents={agents}
        comediens={comediens}
        defaultTaux={defaultTaux}
        initialData={initialData}
      />
    </div>
  );
}

function TemplateCard({
  tpl,
  isActive,
  onSelect,
}: {
  tpl: DevisTemplate;
  isActive: boolean;
  onSelect: () => void;
}) {
  const sectionCount = (tpl.sections as TemplateSection[]).length;
  const ligneCount = (tpl.sections as TemplateSection[]).reduce(
    (s, sec) => s + sec.lignes.length,
    0
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 rounded-[var(--radius-card)] border transition-all ${
        isActive
          ? "border-status-info-bg bg-status-info-bg ring-1 ring-brand-blue"
          : "border-brand-rule hover:border-status-info-bg hover:bg-status-info-bg/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-semibold truncate ${isActive ? "text-brand-blue" : "text-brand-ink"}`}>
            {tpl.name}
          </p>
          {tpl.description && (
            <p className="text-xs text-brand-ink-muted mt-0.5 truncate">{tpl.description}</p>
          )}
          <p className="text-xs text-brand-ink-muted mt-1">
            {sectionCount} section{sectionCount > 1 ? "s" : ""} · {ligneCount} ligne{ligneCount > 1 ? "s" : ""}
            {tpl.isShared && (
              <span className="ml-2 text-brand-blue font-medium">par {tpl.user.name}</span>
            )}
          </p>
        </div>
        {isActive && <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />}
      </div>
    </button>
  );
}

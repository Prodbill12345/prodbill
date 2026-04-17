"use client";

import React, { useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  Download,
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  Loader2,
  Mic2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientRef {
  id: string;
  name: string;
}

interface BudgetLigne {
  id: string;
  clientId: string;
  client: ClientRef;
  libelle: string;
  nomCommercial: string | null;
  montantPrevisionnel: number;
}

interface Budget {
  id: string;
  annee: number;
  lignes: BudgetLigne[];
}

interface AgentSuivi {
  id: string;
  nom: string;
  prenom: string | null;
  agence: string | null;
  tauxCommission: number;
}

interface DevisLigne {
  tag: string;
  quantite: number;
  prixUnit: number;
  total: number;
  tauxIndexation: number;
  agentId: string | null;
  comedienId: string | null;
}

interface ComedienRef {
  id: string;
  prenom: string;
  nom: string;
  agentId: string | null;
}

interface DevisSection {
  lignes: DevisLigne[];
}

interface Devis {
  id: string;
  numero: string | null;
  objet: string;
  statut: string;
  totalHt: number;
  csComedien: number;
  tauxPipe: number | null;
  annee: number | null;
  client: ClientRef;
  sections: DevisSection[];
}

interface BudgetClientProps {
  annee: number;
  budget: Budget | null;
  caParClient: Record<string, number>;
  devis: Devis[];
  clients: ClientRef[];
  agents: AgentSuivi[];
  comediens: ComedienRef[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtEur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

const fmtPct = (n: number) =>
  `${Math.round(n * 10) / 10}%`;

const STATUT_LABELS: Record<string, string> = {
  BROUILLON: "Brouillon",
  ENVOYE: "Envoyé",
  ACCEPTE: "Accepté",
  REFUSE: "Refusé",
  EXPIRE: "Expiré",
};

const STATUT_COLORS: Record<string, string> = {
  BROUILLON: "bg-slate-100 text-slate-500",
  ENVOYE: "bg-blue-50 text-blue-600",
  ACCEPTE: "bg-emerald-50 text-emerald-700",
  REFUSE: "bg-red-50 text-red-600",
  EXPIRE: "bg-orange-50 text-orange-600",
};

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(value, 100);
  const color =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 50
      ? "bg-amber-500"
      : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-xs font-semibold tabular-nums ${
          pct >= 80
            ? "text-emerald-600"
            : pct >= 50
            ? "text-amber-600"
            : "text-red-500"
        }`}
      >
        {Math.round(value)}%
      </span>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function BudgetClient({
  annee,
  budget: initialBudget,
  caParClient,
  devis: initialDevis,
  clients,
  agents,
  comediens,
}: BudgetClientProps) {
  const [budget, setBudget] = useState<Budget | null>(initialBudget);
  const [devis, setDevis] = useState<Devis[]>(initialDevis);
  const [pipeFilter, setPipeFilter] = useState<string>("tous");
  const [isPending, startTransition] = useTransition();

  // ── Nouvelle ligne budget (formulaire inline) ──────────────────────────────
  const [newClientId, setNewClientId] = useState(clients[0]?.id ?? "");
  const [newLibelle, setNewLibelle] = useState("");
  const [newCommercial, setNewCommercial] = useState("");
  const [newMontant, setNewMontant] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  async function ensureBudget(): Promise<Budget> {
    if (budget) return budget;
    const res = await fetch("/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annee }),
    });
    const { data } = await res.json();
    setBudget(data);
    return data;
  }

  async function handleAddLigne() {
    if (!newLibelle.trim() || !newMontant || !newClientId) return;
    setSavingBudget(true);
    try {
      const b = await ensureBudget();
      const lignes = [
        ...b.lignes.map((l) => ({
          clientId: l.clientId,
          libelle: l.libelle,
          nomCommercial: l.nomCommercial,
          montantPrevisionnel: l.montantPrevisionnel,
        })),
        {
          clientId: newClientId,
          libelle: newLibelle.trim(),
          nomCommercial: newCommercial.trim() || null,
          montantPrevisionnel: parseFloat(newMontant),
        },
      ];
      const res = await fetch(`/api/budget/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lignes }),
      });
      if (!res.ok) { alert("Erreur lors de la sauvegarde"); return; }
      const { data } = await res.json();
      setBudget(data);
      setNewLibelle("");
      setNewCommercial("");
      setNewMontant("");
    } finally {
      setSavingBudget(false);
    }
  }

  async function handleRemoveLigne(ligneId: string) {
    if (!budget) return;
    setSavingBudget(true);
    try {
      const lignes = budget.lignes
        .filter((l) => l.id !== ligneId)
        .map((l) => ({
          clientId: l.clientId,
          libelle: l.libelle,
          nomCommercial: l.nomCommercial,
          montantPrevisionnel: l.montantPrevisionnel,
        }));
      const res = await fetch(`/api/budget/${budget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lignes }),
      });
      if (!res.ok) return;
      const { data } = await res.json();
      setBudget(data);
    } finally {
      setSavingBudget(false);
    }
  }

  // ── Pipe inline update ─────────────────────────────────────────────────────
  async function handlePipeChange(devisId: string, value: string) {
    const tauxPipe = value === "" ? null : Math.min(100, Math.max(0, parseInt(value, 10)));
    startTransition(async () => {
      await fetch(`/api/devis/${devisId}/pipe`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tauxPipe }),
      });
      setDevis((prev) =>
        prev.map((d) => (d.id === devisId ? { ...d, tauxPipe: tauxPipe } : d))
      );
    });
  }

  // ── Mise à jour commercial inline ─────────────────────────────────────────
  async function handleUpdateCommercial(ligneId: string, value: string) {
    if (!budget) return;
    const lignes = budget.lignes.map((l) => ({
      clientId: l.clientId,
      libelle: l.libelle,
      nomCommercial: l.id === ligneId ? (value.trim() || null) : l.nomCommercial,
      montantPrevisionnel: l.montantPrevisionnel,
    }));
    const res = await fetch(`/api/budget/${budget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lignes }),
    });
    if (res.ok) {
      const { data } = await res.json();
      setBudget(data);
    }
  }

  // ── Calculs bénéfice net ───────────────────────────────────────────────────
  const devisAvecLignes = devis.filter((d) => d.sections.length > 0);

  let totalHtGlobal = 0;
  let coutsArtistesGlobal = 0;

  const beneficeRows = devisAvecLignes.map((d) => {
    const allLignes = d.sections.flatMap((s) => s.lignes);
    const salaires = allLignes
      .filter((l) => l.tag === "ARTISTE")
      .reduce((s, l) => s + l.quantite * l.prixUnit, 0);
    const indexation = allLignes
      .filter((l) => l.tag === "ARTISTE")
      .reduce((s, l) => s + l.total * (l.tauxIndexation ?? 0) / 100, 0);
    const csArtistes = d.csComedien;
    const agent = allLignes
      .filter((l) => l.tag === "AGENT")
      .reduce((s, l) => s + l.quantite * l.prixUnit, 0);
    const couts = salaires + indexation + csArtistes + agent;
    const benefice = d.totalHt - couts;
    const marge = d.totalHt > 0 ? (benefice / d.totalHt) * 100 : 0;
    totalHtGlobal += d.totalHt;
    coutsArtistesGlobal += couts;
    return { d, salaires, indexation, csArtistes, agent, couts, benefice, marge };
  });

  const beneficeNetGlobal = totalHtGlobal - coutsArtistesGlobal;
  const margeNettePct = totalHtGlobal > 0 ? (beneficeNetGlobal / totalHtGlobal) * 100 : 0;

  // ── Pipe — filtrage et totaux ──────────────────────────────────────────────
  const devisFiltres = devis.filter((d) => {
    if (pipeFilter === "tous") return true;
    return d.statut === pipeFilter;
  });
  const totalPondere = devisFiltres.reduce(
    (s, d) => s + (d.totalHt * (d.tauxPipe ?? 0)) / 100,
    0
  );

  // ── Suivi par agent ────────────────────────────────────────────────────────
  const agentStats = agents.map((agent) => {
    const lignesAgent = devis.flatMap((d) =>
      d.sections.flatMap((s) =>
        s.lignes.filter((l) => l.agentId === agent.id)
      )
    );
    const montantHt = lignesAgent.reduce((s, l) => s + l.quantite * l.prixUnit, 0);
    const nbDevis = new Set(
      devis
        .filter((d) => d.sections.some((s) => s.lignes.some((l) => l.agentId === agent.id)))
        .map((d) => d.id)
    ).size;
    const commission = (montantHt * agent.tauxCommission) / 100;

    // Per-comedien breakdown for this agent
    const comedienStats = comediens
      .filter((c) => c.agentId === agent.id)
      .map((c) => {
        const lignesC = devis.flatMap((d) =>
          d.sections.flatMap((s) =>
            s.lignes.filter((l) => l.comedienId === c.id)
          )
        );
        const montant = lignesC.reduce((s, l) => s + l.quantite * l.prixUnit, 0);
        const nb = new Set(
          devis
            .filter((d) => d.sections.some((s) => s.lignes.some((l) => l.comedienId === c.id)))
            .map((d) => d.id)
        ).size;
        return { comedien: c, montant, nb };
      })
      .filter((r) => r.montant > 0 || r.nb > 0);

    return { agent, nbDevis, montantHt, commission, comedienStats };
  }).filter((row) => row.montantHt > 0 || row.nbDevis > 0);

  // ── Budget totaux ──────────────────────────────────────────────────────────
  const lignes = budget?.lignes ?? [];
  const totalPrev = lignes.reduce((s, l) => s + l.montantPrevisionnel, 0);
  const totalRealise = lignes.reduce((s, l) => s + (caParClient[l.clientId] ?? 0), 0);
  const pctGlobal = totalPrev > 0 ? (totalRealise / totalPrev) * 100 : 0;

  return (
    <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
      {/* Titre */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suivi Budgétaire</h1>
          <p className="text-sm text-slate-500 mt-0.5">Exercice {annee}</p>
        </div>
        <a
          href={`/api/budget/export?annee=${annee}`}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 rounded-lg text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          <Download className="w-4 h-4" />
          Exporter tout
        </a>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          Section A — Budget Prévisionnel CA
      ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Target className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Budget Prévisionnel CA</h2>
            <p className="text-xs text-slate-400">Objectifs de chiffre d&apos;affaires par client (compte 7)</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Libellé</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Commercial</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Prévisionnel</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">CA Réalisé</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-40">% Atteinte</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">
                    Aucune ligne — ajoutez un objectif ci-dessous.
                  </td>
                </tr>
              )}
              {lignes.map((ligne) => {
                const ca = caParClient[ligne.clientId] ?? 0;
                const pct = ligne.montantPrevisionnel > 0 ? (ca / ligne.montantPrevisionnel) * 100 : 0;
                return (
                  <tr key={ligne.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                    <td className="px-5 py-3.5 text-sm font-medium text-slate-700">{ligne.client.name}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-600">{ligne.libelle}</td>
                    <td className="px-2 py-2.5">
                      <input
                        type="text"
                        defaultValue={ligne.nomCommercial ?? ""}
                        onBlur={(e) => handleUpdateCommercial(ligne.id, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        placeholder="—"
                        className="w-full px-2 py-1 text-sm text-slate-600 border-0 bg-transparent hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-300 rounded-md min-w-[100px]"
                      />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium text-slate-700">{fmtEur(ligne.montantPrevisionnel)}</td>
                    <td className="px-5 py-3.5 text-sm text-right tabular-nums text-slate-600">{fmtEur(ca)}</td>
                    <td className="px-5 py-3.5">
                      <ProgressBar value={pct} />
                    </td>
                    <td className="px-3 py-3.5">
                      <button
                        onClick={() => handleRemoveLigne(ligne.id)}
                        disabled={savingBudget}
                        className="text-slate-200 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {lignes.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={3} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Total</td>
                  <td className="px-5 py-3 text-sm text-right tabular-nums font-bold text-slate-800">{fmtEur(totalPrev)}</td>
                  <td className="px-5 py-3 text-sm text-right tabular-nums font-bold text-slate-800">{fmtEur(totalRealise)}</td>
                  <td className="px-5 py-3">
                    <ProgressBar value={pctGlobal} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Formulaire ajout */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/40">
          <div className="flex gap-2 items-end">
            <div className="flex-shrink-0 w-44">
              <label className="block text-xs text-slate-500 mb-1">Client</label>
              <select
                value={newClientId}
                onChange={(e) => setNewClientId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Libellé</label>
              <input
                type="text"
                value={newLibelle}
                onChange={(e) => setNewLibelle(e.target.value)}
                placeholder="Ex : Production spots TV"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                onKeyDown={(e) => e.key === "Enter" && handleAddLigne()}
              />
            </div>
            <div className="w-32">
              <label className="block text-xs text-slate-500 mb-1">Commercial</label>
              <input
                type="text"
                value={newCommercial}
                onChange={(e) => setNewCommercial(e.target.value)}
                placeholder="Ex : Sophie"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                onKeyDown={(e) => e.key === "Enter" && handleAddLigne()}
              />
            </div>
            <div className="w-36">
              <label className="block text-xs text-slate-500 mb-1">Montant prévisionnel</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={newMontant}
                  onChange={(e) => setNewMontant(e.target.value)}
                  placeholder="0,00"
                  min="0"
                  step="100"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  onKeyDown={(e) => e.key === "Enter" && handleAddLigne()}
                />
                <span className="text-slate-400 text-xs shrink-0">€</span>
              </div>
            </div>
            <button
              onClick={handleAddLigne}
              disabled={savingBudget || !newLibelle.trim() || !newMontant || !newClientId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 rounded-lg text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {savingBudget ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Ajouter
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          Section B — Suivi PIPE Devis
      ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Suivi PIPE Devis</h2>
              <p className="text-xs text-slate-400">Probabilité de closing par devis</p>
            </div>
          </div>
          {/* Filtre statut */}
          <div className="flex gap-1">
            {["tous", "BROUILLON", "ENVOYE", "ACCEPTE"].map((s) => (
              <button
                key={s}
                onClick={() => setPipeFilter(s)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  pipeFilter === s
                    ? "bg-blue-600 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {s === "tous" ? "Tous" : STATUT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Devis</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Montant HT</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Statut</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">% PIPE</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Montant pondéré</th>
              </tr>
            </thead>
            <tbody>
              {devisFiltres.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">Aucun devis</td>
                </tr>
              )}
              {devisFiltres.map((d) => {
                const pipe = d.tauxPipe ?? 0;
                const pondere = (d.totalHt * pipe) / 100;
                return (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                    <td className="px-5 py-3.5">
                      <a href={`/devis/${d.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                        {d.numero ?? "Brouillon"}
                      </a>
                      <p className="text-xs text-slate-400 truncate max-w-xs">{d.objet}</p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600">{d.client.name}</td>
                    <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium text-slate-700">{fmtEur(d.totalHt)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[d.statut] ?? "bg-slate-100 text-slate-500"}`}>
                        {STATUT_LABELS[d.statut] ?? d.statut}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-1.5 justify-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={pipe}
                          onBlur={(e) => handlePipeChange(d.id, e.target.value)}
                          className="w-14 px-2 py-1 border border-slate-200 rounded-md text-xs text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-right tabular-nums text-slate-600">
                      {pondere > 0 ? fmtEur(pondere) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Total pondéré
                </td>
                <td className="px-5 py-3 text-sm text-right tabular-nums font-bold text-slate-800">
                  {fmtEur(totalPondere)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          Section C — Bénéfice Net
      ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Bénéfice Net</h2>
            <p className="text-xs text-slate-400">Total HT moins salaires artistes, indexations, CS et agent</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 p-6 border-b border-slate-100">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Total HT</p>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{fmtEur(totalHtGlobal)}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4">
            <p className="text-xs text-red-500 font-medium uppercase tracking-wider mb-1">Coûts artistes</p>
            <p className="text-xl font-bold text-red-700 tabular-nums">{fmtEur(coutsArtistesGlobal)}</p>
            <p className="text-xs text-red-400 mt-0.5">Salaires + indexation + CS + agent</p>
          </div>
          <div className={`rounded-xl p-4 ${beneficeNetGlobal >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
            <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${beneficeNetGlobal >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              Bénéfice net
            </p>
            <p className={`text-xl font-bold tabular-nums ${beneficeNetGlobal >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {fmtEur(beneficeNetGlobal)}
            </p>
          </div>
          <div className="bg-violet-50 rounded-xl p-4">
            <p className="text-xs text-violet-500 font-medium uppercase tracking-wider mb-1">Marge nette</p>
            <div className="flex items-end gap-2">
              <p className="text-xl font-bold text-violet-700 tabular-nums">{fmtPct(margeNettePct)}</p>
              {margeNettePct >= 0
                ? <TrendingUp className="w-4 h-4 text-violet-500 mb-0.5" />
                : <TrendingDown className="w-4 h-4 text-red-500 mb-0.5" />
              }
            </div>
          </div>
        </div>

        {/* Détail par devis */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Devis</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Total HT</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Salaires</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Indexation</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">CS Art.</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Bénéfice</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Marge</th>
              </tr>
            </thead>
            <tbody>
              {beneficeRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-400">Aucun devis</td>
                </tr>
              )}
              {beneficeRows.map(({ d, salaires, indexation, csArtistes, agent, couts, benefice, marge }) => (
                <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                  <td className="px-5 py-3.5">
                    <a href={`/devis/${d.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {d.numero ?? "Brouillon"}
                    </a>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600">{d.client.name}</td>
                  <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium text-slate-700">{fmtEur(d.totalHt)}</td>
                  <td className="px-5 py-3.5 text-sm text-right tabular-nums text-red-500">{salaires > 0 ? fmtEur(salaires) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-sm text-right tabular-nums text-violet-500">{indexation > 0 ? fmtEur(indexation) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-sm text-right tabular-nums text-orange-500">{csArtistes > 0 ? fmtEur(csArtistes) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-sm text-right tabular-nums text-amber-600">{agent > 0 ? fmtEur(agent) : <span className="text-slate-300">—</span>}</td>
                  <td className={`px-5 py-3.5 text-sm text-right tabular-nums font-semibold ${benefice >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtEur(benefice)}
                  </td>
                  <td className={`px-5 py-3.5 text-sm text-right tabular-nums ${marge >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtPct(marge)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          Section D — Suivi par agent
      ────────────────────────────────────────────────────────────────────── */}
      {agents.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <Mic2 className="w-4 h-4 text-rose-500" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Suivi par agent</h2>
              <p className="text-xs text-slate-400">Montant des lignes associées et commission estimée</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Agence</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nb devis</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Montant HT total</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Taux</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Commission estimée</th>
                </tr>
              </thead>
              <tbody>
                {agentStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                      Aucun agent associé à des lignes de devis
                    </td>
                  </tr>
                ) : (
                  agentStats.map(({ agent, nbDevis, montantHt, commission, comedienStats }) => (
                    <React.Fragment key={agent.id}>
                      <tr className="border-b border-slate-50 hover:bg-slate-50/40">
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800">
                          {agent.prenom ? `${agent.prenom} ${agent.nom}` : agent.nom}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-500">
                          {agent.agence ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-center tabular-nums text-slate-600">{nbDevis}</td>
                        <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium text-slate-700">{fmtEur(montantHt)}</td>
                        <td className="px-5 py-3.5 text-sm text-right tabular-nums text-slate-500">{agent.tauxCommission}%</td>
                        <td className="px-5 py-3.5 text-sm text-right tabular-nums font-semibold text-rose-600">{fmtEur(commission)}</td>
                      </tr>
                      {comedienStats.map(({ comedien, montant, nb }) => (
                        <tr key={`${agent.id}-${comedien.id}`} className="border-b border-slate-50 bg-slate-50/30">
                          <td className="pl-10 pr-5 py-2 text-xs text-slate-500 flex items-center gap-1.5">
                            <span className="text-slate-300">↳</span>
                            {comedien.prenom} {comedien.nom}
                          </td>
                          <td />
                          <td className="px-5 py-2 text-xs text-center tabular-nums text-slate-400">{nb}</td>
                          <td className="px-5 py-2 text-xs text-right tabular-nums text-slate-500">{fmtEur(montant)}</td>
                          <td colSpan={2} />
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
              {agentStats.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={3} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Total</td>
                    <td className="px-5 py-3 text-sm text-right tabular-nums font-bold text-slate-800">
                      {fmtEur(agentStats.reduce((s, r) => s + r.montantHt, 0))}
                    </td>
                    <td />
                    <td className="px-5 py-3 text-sm text-right tabular-nums font-bold text-rose-700">
                      {fmtEur(agentStats.reduce((s, r) => s + r.commission, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Loader2, UserRound, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { sortByLabelFr } from "@/lib/sort-by-name";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { DEVIS_STATUT_TONE } from "@/design/status";
import type { StatusTone } from "@/design/tokens";
import type { DevisStatut } from "@prisma/client";

interface AgentRef {
  id: string;
  nom: string;
  prenom: string | null;
  agence: string | null;
}

interface Comedien {
  id: string;
  prenom: string;
  nom: string;
  agentId: string | null;
  agent: AgentRef | null;
  nbDevis: number;
  montantTotal: number;
}

interface ComediensClientProps {
  comediens: Comedien[];
  agents: AgentRef[];
}

// ─── Types pour le drawer projets ────────────────────────────────────────────

interface ProjetLigne {
  id: string;
  libelle: string;
  tag: string;
  montantHt: number;
  paiementComedien: boolean;
}

interface Projet {
  devisId: string;
  numero: string | null;
  nomProjet: string | null;
  objet: string;
  statut: string;
  dateSeance: string | null;
  client: { id: string; name: string };
  lignes: ProjetLigne[];
  montantTotalHt: number;
}

interface DrawerData {
  comedien: { id: string; prenom: string; nom: string; agent: AgentRef | null };
  projets: Projet[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = { prenom: "", nom: "", agentId: "" };

const fmtEur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(d));
};

const STATUT_LABELS: Record<string, string> = {
  BROUILLON: "Brouillon",
  ENVOYE: "Envoyé",
  ACCEPTE: "Accepté",
  REFUSE: "Refusé",
  EXPIRE: "Expiré",
};
// Ton DA du badge (src/design/status.ts) ; statut inconnu → neutre.
const statutTone = (s: string): StatusTone =>
  DEVIS_STATUT_TONE[s as DevisStatut] ?? "neutral";

// ─── Composant ───────────────────────────────────────────────────────────────

export function ComediensClient({ comediens: initialComediens, agents }: ComediensClientProps) {
  const [comediens, setComediens] = useState<Comedien[]>(initialComediens);

  // Dropdown "agent" trié par ordre alphabétique français.
  const sortedAgents = useMemo(
    () => sortByLabelFr(agents, (a) => (a.prenom ? `${a.prenom} ${a.nom}` : a.nom)),
    [agents]
  );
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Comedien | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Drawer projets
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(c: Comedien, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(c);
    setForm({ prenom: c.prenom, nom: c.nom, agentId: c.agentId ?? "" });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.nom.trim() || !form.prenom.trim()) return;
    setSaving(true);
    try {
      const body = {
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        agentId: form.agentId || null,
      };

      if (editing) {
        const res = await fetch(`/api/comediens/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { alert("Erreur lors de la sauvegarde"); return; }
        const { data } = await res.json();
        const agent = agents.find((a) => a.id === data.agentId) ?? null;
        setComediens((prev) =>
          prev.map((c) => c.id === editing.id ? { ...data, agent, nbDevis: editing.nbDevis, montantTotal: editing.montantTotal } : c)
        );
      } else {
        const res = await fetch("/api/comediens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { alert("Erreur lors de la création"); return; }
        const { data } = await res.json();
        const agent = agents.find((a) => a.id === data.agentId) ?? null;
        setComediens((prev) => [...prev, { ...data, agent, nbDevis: 0, montantTotal: 0 }]);
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Supprimer ce comédien ? Les lignes devis associées seront détachées.")) return;
    setDeleting(id);
    try {
      await fetch(`/api/comediens/${id}`, { method: "DELETE" });
      setComediens((prev) => prev.filter((c) => c.id !== id));
      if (drawer?.comedien.id === id) setDrawer(null);
    } finally {
      setDeleting(null);
    }
  }

  // ── Drawer ──────────────────────────────────────────────────────────────────

  async function openDrawer(c: Comedien) {
    setDrawerLoading(true);
    setDrawer({ comedien: { id: c.id, prenom: c.prenom, nom: c.nom, agent: c.agent }, projets: [] });
    try {
      const res = await fetch(`/api/comediens/${c.id}/projets`);
      if (!res.ok) { setDrawer(null); return; }
      const { data } = await res.json();
      setDrawer(data);
    } finally {
      setDrawerLoading(false);
    }
  }

  const totalMontant = drawer?.projets.reduce((s, p) => s + p.montantTotalHt, 0) ?? 0;

  async function togglePaiement(devisId: string, lignes: ProjetLigne[]) {
    // Si toutes les lignes sont payées → on bascule à false, sinon → true
    const allPaid = lignes.every((l) => l.paiementComedien);
    const newState = !allPaid;

    // Optimistic update
    setDrawer((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        projets: prev.projets.map((p) =>
          p.devisId === devisId
            ? { ...p, lignes: p.lignes.map((l) => ({ ...l, paiementComedien: newState })) }
            : p
        ),
      };
    });

    // Appels API en parallèle pour toutes les lignes du projet
    await Promise.all(
      lignes.map((l) =>
        fetch(`/api/comediens/lignes/${l.id}/paiement`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paiementComedien: newState }),
        })
      )
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">Comédiens</h1>
          <p className="text-sm text-brand-ink-muted mt-0.5">Artistes voix associés aux devis</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-brand-blue rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream hover:bg-brand-ink transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter un comédien
        </button>
      </div>

      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-x-auto">
        {comediens.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-brand-ink-muted">
            <UserRound className="w-10 h-10 text-brand-ink-subtle" />
            <p className="text-sm">Aucun comédien enregistré</p>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 text-sm text-brand-blue hover:text-brand-blue"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter le premier comédien
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-rule bg-brand-surface/60">
                <th className="text-left px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Comédien</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Agent</th>
                <th className="text-center px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Nb devis</th>
                <th className="text-right px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Montant total lignes</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {comediens.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openDrawer(c)}
                  className="border-b border-brand-rule hover:bg-brand-surface/60 transition-colors cursor-pointer group"
                >
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-brand-ink group-hover:text-brand-blue transition-colors">
                      {c.prenom} {c.nom}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-brand-ink-muted">
                    {c.agent
                      ? <span>{c.agent.prenom ? `${c.agent.prenom} ${c.agent.nom}` : c.agent.nom}{c.agent.agence ? <span className="text-brand-ink-muted"> — {c.agent.agence}</span> : null}</span>
                      : <span className="text-brand-ink-subtle">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-center tabular-nums text-brand-ink-muted">{c.nbDevis}</td>
                  <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium text-brand-ink">
                    {c.montantTotal > 0 ? fmtEur(c.montantTotal) : <span className="text-brand-ink-subtle">—</span>}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={(e) => openEdit(c, e)}
                        className="text-brand-ink-subtle hover:text-brand-blue transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(c.id, e)}
                        disabled={deleting === c.id}
                        className="text-brand-ink-subtle hover:text-brand-coral transition-colors"
                        title="Supprimer"
                      >
                        {deleting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-brand-ink-subtle group-hover:text-brand-ink-muted transition-colors" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Drawer Projets ──────────────────────────────────────────────────── */}
      {drawer && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-brand-ink/30 backdrop-blur-[2px]"
            onClick={() => setDrawer(null)}
          />

          {/* Panneau */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-brand-paper shadow-2xl flex flex-col">
            {/* En-tête */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-brand-rule">
              <div>
                <h2 className="text-lg font-semibold text-brand-ink">
                  {drawer.comedien.prenom} {drawer.comedien.nom}
                </h2>
                <p className="text-sm text-brand-ink-muted mt-0.5">
                  {drawer.comedien.agent
                    ? <>Agent : <span className="text-brand-ink-muted font-medium">{drawer.comedien.agent.prenom ? `${drawer.comedien.agent.prenom} ${drawer.comedien.agent.nom}` : drawer.comedien.agent.nom}</span>{drawer.comedien.agent.agence ? <span className="text-brand-ink-muted"> — {drawer.comedien.agent.agence}</span> : null}</>
                    : "Aucun agent associé"}
                </p>
              </div>
              <button
                onClick={() => setDrawer(null)}
                className="text-brand-ink-muted hover:text-brand-ink transition-colors mt-0.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps */}
            <div className="flex-1 overflow-y-auto">
              {drawerLoading ? (
                <div className="flex items-center justify-center h-40 gap-2 text-brand-ink-muted">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Chargement…</span>
                </div>
              ) : drawer.projets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-brand-ink-muted">
                  <UserRound className="w-8 h-8 text-brand-ink-subtle" />
                  <p className="text-sm">Aucun projet pour ce comédien</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-brand-paper border-b border-brand-rule">
                    <tr className="bg-brand-surface/80">
                      <th className="text-left px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">N° Devis</th>
                      <th className="text-left px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Nom projet</th>
                      <th className="text-left px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Client</th>
                      <th className="text-left px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Date séance</th>
                      <th className="text-center px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Statut</th>
                      <th className="text-right px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Montant HT</th>
                      <th className="text-center px-5 py-3 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">Paiement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-rule">
                    {drawer.projets.map((p) => (
                      <tr key={p.devisId} className="hover:bg-brand-surface/50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/devis/${p.devisId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:text-brand-ink"
                          >
                            {p.numero ?? "Brouillon"}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm text-brand-ink font-medium truncate max-w-[160px]">
                            {p.nomProjet ?? p.objet}
                          </p>
                          {p.nomProjet && (
                            <p className="text-xs text-brand-ink-muted truncate max-w-[160px]">{p.objet}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-brand-ink-muted">{p.client.name}</td>
                        <td className="px-5 py-3.5 text-sm text-brand-ink-muted">{fmtDate(p.dateSeance)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <StatusBadge tone={statutTone(p.statut)} label={STATUT_LABELS[p.statut] ?? p.statut} />
                        </td>
                        <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium text-brand-ink">
                          {fmtEur(p.montantTotalHt)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePaiement(p.devisId, p.lignes); }}
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                              p.lignes.every((l) => l.paiementComedien)
                                ? "bg-status-success-bg text-brand-ink hover:bg-brand-pistachio"
                                : "bg-status-danger-bg text-brand-ink hover:bg-brand-coral/40"
                            }`}
                          >
                            {p.lignes.every((l) => l.paiementComedien) ? "Payé" : "Non payé"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-brand-rule bg-brand-surface">
                      <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-brand-ink-muted uppercase">
                        {drawer.projets.length} projet{drawer.projets.length > 1 ? "s" : ""}
                      </td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums font-bold text-brand-ink">
                        {fmtEur(totalMontant)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Modal création/édition ──────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 backdrop-blur-sm">
          <div className="bg-brand-paper rounded-[var(--radius-card)] shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-ink">
                {editing ? "Modifier le comédien" : "Nouveau comédien"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-brand-ink-muted hover:text-brand-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-brand-ink-muted mb-1">Prénom *</label>
                  <input
                    type="text"
                    value={form.prenom}
                    onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))}
                    placeholder="Sophie"
                    autoFocus
                    className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-ink-muted mb-1">Nom *</label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                    placeholder="Dupont"
                    className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-ink-muted mb-1">Agent (optionnel)</label>
                <select
                  value={form.agentId}
                  onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
                  className="w-full px-3 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue bg-brand-paper"
                >
                  <option value="">Aucun agent</option>
                  {sortedAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.prenom ? `${a.prenom} ${a.nom}` : a.nom}{a.agence ? ` — ${a.agence}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink-muted hover:bg-brand-surface"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!form.nom.trim() || !form.prenom.trim() || saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-blue rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream hover:bg-brand-ink disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editing ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

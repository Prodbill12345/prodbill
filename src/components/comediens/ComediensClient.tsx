"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, UserRound, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";

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
const STATUT_COLORS: Record<string, string> = {
  BROUILLON: "bg-slate-100 text-slate-500",
  ENVOYE: "bg-blue-50 text-blue-600",
  ACCEPTE: "bg-emerald-50 text-emerald-700",
  REFUSE: "bg-red-50 text-red-600",
  EXPIRE: "bg-orange-50 text-orange-600",
};

// ─── Composant ───────────────────────────────────────────────────────────────

export function ComediensClient({ comediens: initialComediens, agents }: ComediensClientProps) {
  const [comediens, setComediens] = useState<Comedien[]>(initialComediens);
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
          <h1 className="text-2xl font-bold text-slate-900">Comédiens</h1>
          <p className="text-sm text-slate-500 mt-0.5">Artistes voix associés aux devis</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter un comédien
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {comediens.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <UserRound className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Aucun comédien enregistré</p>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter le premier comédien
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Comédien</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nb devis</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Montant total lignes</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {comediens.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openDrawer(c)}
                  className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors cursor-pointer group"
                >
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700 transition-colors">
                      {c.prenom} {c.nom}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600">
                    {c.agent
                      ? <span>{c.agent.prenom ? `${c.agent.prenom} ${c.agent.nom}` : c.agent.nom}{c.agent.agence ? <span className="text-slate-400"> — {c.agent.agence}</span> : null}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-center tabular-nums text-slate-600">{c.nbDevis}</td>
                  <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium text-slate-700">
                    {c.montantTotal > 0 ? fmtEur(c.montantTotal) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={(e) => openEdit(c, e)}
                        className="text-slate-300 hover:text-blue-500 transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(c.id, e)}
                        disabled={deleting === c.id}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="Supprimer"
                      >
                        {deleting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-slate-400 transition-colors" />
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
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setDrawer(null)}
          />

          {/* Panneau */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-2xl flex flex-col">
            {/* En-tête */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {drawer.comedien.prenom} {drawer.comedien.nom}
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  {drawer.comedien.agent
                    ? <>Agent : <span className="text-slate-600 font-medium">{drawer.comedien.agent.prenom ? `${drawer.comedien.agent.prenom} ${drawer.comedien.agent.nom}` : drawer.comedien.agent.nom}</span>{drawer.comedien.agent.agence ? <span className="text-slate-400"> — {drawer.comedien.agent.agence}</span> : null}</>
                    : "Aucun agent associé"}
                </p>
              </div>
              <button
                onClick={() => setDrawer(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps */}
            <div className="flex-1 overflow-y-auto">
              {drawerLoading ? (
                <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Chargement…</span>
                </div>
              ) : drawer.projets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                  <UserRound className="w-8 h-8 text-slate-200" />
                  <p className="text-sm">Aucun projet pour ce comédien</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr className="bg-slate-50/80">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">N° Devis</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nom projet</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date séance</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Statut</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Montant HT</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Paiement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {drawer.projets.map((p) => (
                      <tr key={p.devisId} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/devis/${p.devisId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            {p.numero ?? "Brouillon"}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm text-slate-700 font-medium truncate max-w-[160px]">
                            {p.nomProjet ?? p.objet}
                          </p>
                          {p.nomProjet && (
                            <p className="text-xs text-slate-400 truncate max-w-[160px]">{p.objet}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-600">{p.client.name}</td>
                        <td className="px-5 py-3.5 text-sm text-slate-500">{fmtDate(p.dateSeance)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[p.statut] ?? "bg-slate-100 text-slate-500"}`}>
                            {STATUT_LABELS[p.statut] ?? p.statut}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium text-slate-700">
                          {fmtEur(p.montantTotalHt)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePaiement(p.devisId, p.lignes); }}
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                              p.lignes.every((l) => l.paiementComedien)
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                            }`}
                          >
                            {p.lignes.every((l) => l.paiementComedien) ? "Payé" : "Non payé"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase">
                        {drawer.projets.length} projet{drawer.projets.length > 1 ? "s" : ""}
                      </td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums font-bold text-slate-800">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? "Modifier le comédien" : "Nouveau comédien"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Prénom *</label>
                  <input
                    type="text"
                    value={form.prenom}
                    onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))}
                    placeholder="Sophie"
                    autoFocus
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nom *</label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                    placeholder="Dupont"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Agent (optionnel)</label>
                <select
                  value={form.agentId}
                  onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Aucun agent</option>
                  {agents.map((a) => (
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
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!form.nom.trim() || !form.prenom.trim() || saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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

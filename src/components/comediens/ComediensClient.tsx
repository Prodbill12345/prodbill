"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, UserRound } from "lucide-react";

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

const EMPTY_FORM = { prenom: "", nom: "", agentId: "" };

const fmtEur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

export function ComediensClient({ comediens: initialComediens, agents }: ComediensClientProps) {
  const [comediens, setComediens] = useState<Comedien[]>(initialComediens);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Comedien | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(c: Comedien) {
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

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce comédien ? Les lignes devis associées seront détachées.")) return;
    setDeleting(id);
    try {
      await fetch(`/api/comediens/${id}`, { method: "DELETE" });
      setComediens((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeleting(null);
    }
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
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {comediens.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-slate-800">{c.prenom} {c.nom}</p>
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
                      <button onClick={() => openEdit(c)} className="text-slate-300 hover:text-blue-500 transition-colors" title="Modifier">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deleting === c.id}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="Supprimer"
                      >
                        {deleting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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

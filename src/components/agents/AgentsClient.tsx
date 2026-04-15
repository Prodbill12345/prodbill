"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, UserRound } from "lucide-react";

interface Agent {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  agence: string | null;
  tauxCommission: number;
}

interface AgentsClientProps {
  agents: Agent[];
}

const EMPTY_FORM = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  agence: "",
  tauxCommission: 10,
};

export function AgentsClient({ agents: initialAgents }: AgentsClientProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(a: Agent) {
    setEditing(a);
    setForm({
      nom: a.nom,
      prenom: a.prenom ?? "",
      email: a.email ?? "",
      telephone: a.telephone ?? "",
      agence: a.agence ?? "",
      tauxCommission: a.tauxCommission,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.nom.trim()) return;
    setSaving(true);
    try {
      const body = {
        nom: form.nom.trim(),
        prenom: form.prenom.trim() || undefined,
        email: form.email.trim() || undefined,
        telephone: form.telephone.trim() || undefined,
        agence: form.agence.trim() || undefined,
        tauxCommission: Number(form.tauxCommission),
      };

      if (editing) {
        const res = await fetch(`/api/agents/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { alert("Erreur lors de la sauvegarde"); return; }
        const { data } = await res.json();
        setAgents((prev) => prev.map((a) => (a.id === editing.id ? data : a)));
      } else {
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { alert("Erreur lors de la création"); return; }
        const { data } = await res.json();
        setAgents((prev) => [...prev, data]);
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cet agent ? Les lignes devis associées seront détachées.")) return;
    setDeleting(id);
    try {
      await fetch(`/api/agents/${id}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
      {/* Titre */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agents</h1>
          <p className="text-sm text-slate-500 mt-0.5">Agents et agences voix-off</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter un agent
        </button>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {agents.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <UserRound className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Aucun agent enregistré</p>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter le premier agent
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nom</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Agence</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Téléphone</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Commission</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-slate-800">
                      {a.prenom ? `${a.prenom} ${a.nom}` : a.nom}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600">
                    {a.agence ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600">
                    {a.email
                      ? <a href={`mailto:${a.email}`} className="hover:text-blue-600 hover:underline">{a.email}</a>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600">
                    {a.telephone ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-right tabular-nums font-medium text-slate-700">
                    {a.tauxCommission}%
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(a)}
                        className="text-slate-300 hover:text-blue-500 transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        disabled={deleting === a.id}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="Supprimer"
                      >
                        {deleting === a.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal création / édition */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? "Modifier l'agent" : "Nouvel agent"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Prénom</label>
                <input
                  type="text"
                  value={form.prenom}
                  onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))}
                  placeholder="Sophie"
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
                  autoFocus
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Agence</label>
                <input
                  type="text"
                  value={form.agence}
                  onChange={(e) => setForm((f) => ({ ...f, agence: e.target.value }))}
                  placeholder="Agence Voix & Co"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="sophie@agence.fr"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={form.telephone}
                  onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                  placeholder="06 12 34 56 78"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Taux de commission (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.tauxCommission}
                  onChange={(e) => setForm((f) => ({ ...f, tauxCommission: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!form.nom.trim() || saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
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

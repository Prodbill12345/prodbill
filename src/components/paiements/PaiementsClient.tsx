"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import {
  FACTURE_STATUT_COLORS,
  FACTURE_STATUT_LABELS,
  FACTURE_TYPE_LABELS,
} from "@/types";
import { PaiementModal, type FacturePaiementInfo } from "./PaiementModal";
import type { FactureStatut, FactureType } from "@/types";

export interface FactureRow {
  id: string;
  numero: string;
  type: FactureType;
  statut: FactureStatut;
  totalTtc: number;
  totalHt: number;
  resteAPayer: number;
  dateEcheance: Date | null;
  joursRetard: number;
  penalites: number;
  clientName: string;
}

interface Props {
  factures: FactureRow[];
}

export function PaiementsClient({ factures }: Props) {
  const router = useRouter();
  const [modalFacture, setModalFacture] = useState<FacturePaiementInfo | null>(null);

  function openModal(f: FactureRow) {
    setModalFacture({
      id: f.id,
      numero: f.numero,
      totalTtc: f.totalTtc,
      resteAPayer: f.resteAPayer,
    });
  }

  function handleSuccess() {
    setModalFacture(null);
    router.refresh();
  }

  const canPay = (f: FactureRow) =>
    f.resteAPayer > 0.01 &&
    ["EMISE", "PAYEE_PARTIEL", "EN_RETARD"].includes(f.statut);

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Facture
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Client
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Type
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Échéance
              </th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Total TTC
              </th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Reste dû
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Statut
              </th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {factures.map((f) => {
              const isRetard = f.joursRetard > 0;
              return (
                <tr
                  key={f.id}
                  className={`hover:bg-slate-50 transition-colors ${
                    isRetard ? "bg-red-50/40" : ""
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/factures/${f.id}`}
                      className="font-medium text-blue-600 hover:text-blue-700 text-sm"
                    >
                      {f.numero}
                    </Link>
                  </td>

                  <td className="px-5 py-3.5 text-sm text-slate-700">
                    {f.clientName}
                  </td>

                  <td className="px-5 py-3.5 text-sm text-slate-500">
                    {FACTURE_TYPE_LABELS[f.type]}
                  </td>

                  <td className="px-5 py-3.5">
                    {f.dateEcheance ? (
                      <div>
                        <p
                          className={`text-sm ${
                            isRetard
                              ? "text-red-600 font-medium"
                              : "text-slate-600"
                          }`}
                        >
                          {formatDate(f.dateEcheance)}
                        </p>
                        {isRetard && (
                          <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {f.joursRetard}j de retard
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 text-sm font-semibold text-right tabular-nums text-slate-900">
                    {formatEuros(f.totalTtc)}
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    {f.resteAPayer > 0.01 ? (
                      <div>
                        <p className="text-sm font-bold tabular-nums text-slate-900">
                          {formatEuros(f.resteAPayer)}
                        </p>
                        {isRetard && f.penalites > 0 && (
                          <p className="text-xs text-red-500 tabular-nums mt-0.5" title="Pénalités de retard (15%/an)">
                            +{formatEuros(f.penalites)} pénalités
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="flex items-center justify-end gap-1 text-sm text-green-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Soldée
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        FACTURE_STATUT_COLORS[f.statut]
                      }`}
                    >
                      {FACTURE_STATUT_LABELS[f.statut]}
                    </span>
                  </td>

                  <td className="px-5 py-3.5">
                    {canPay(f) && (
                      <button
                        onClick={() => openModal(f)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Paiement
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {factures.length === 0 && (
          <p className="px-5 py-12 text-center text-slate-400 text-sm">
            Aucune facture émise
          </p>
        )}
      </div>

      {modalFacture && (
        <PaiementModal
          facture={modalFacture}
          onClose={() => setModalFacture(null)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}

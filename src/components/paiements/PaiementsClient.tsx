"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { FACTURE_STATUT_LABELS, FACTURE_TYPE_LABELS } from "@/types";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { FACTURE_STATUT_TONE } from "@/design/status";
import { PaiementModal, type FacturePaiementInfo } from "./PaiementModal";
import { formatFactureNumero } from "@/lib/facture-numero";
import type { FactureStatut, FactureType } from "@/types";

export interface FactureRow {
  id: string;
  numero: string | null;
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
      <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brand-rule">
              <th className="text-left px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">
                Facture
              </th>
              <th className="text-left px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">
                Client
              </th>
              <th className="text-left px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">
                Type
              </th>
              <th className="text-left px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">
                Échéance
              </th>
              <th className="text-right px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">
                Total TTC
              </th>
              <th className="text-right px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">
                Reste dû
              </th>
              <th className="text-left px-5 py-3.5 text-[10px] font-medium text-brand-ink-muted uppercase tracking-[0.15em]">
                Statut
              </th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-rule">
            {factures.map((f) => {
              const isRetard = f.joursRetard > 0;
              return (
                <tr
                  key={f.id}
                  className={`hover:bg-brand-surface transition-colors ${
                    isRetard ? "bg-status-danger-bg/30" : ""
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/factures/${f.id}`}
                      className="font-medium text-brand-blue hover:text-brand-blue text-sm"
                    >
                      {formatFactureNumero(f)}
                    </Link>
                  </td>

                  <td className="px-5 py-3.5 text-sm text-brand-ink">
                    {f.clientName}
                  </td>

                  <td className="px-5 py-3.5 text-sm text-brand-ink-muted">
                    {FACTURE_TYPE_LABELS[f.type]}
                  </td>

                  <td className="px-5 py-3.5">
                    {f.dateEcheance ? (
                      <div>
                        <p
                          className={`text-sm ${
                            isRetard
                              ? "text-brand-coral-ink font-medium"
                              : "text-brand-ink-muted"
                          }`}
                        >
                          {formatDate(f.dateEcheance)}
                        </p>
                        {isRetard && (
                          <p className="text-xs text-brand-coral-ink mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {f.joursRetard}j de retard
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-brand-ink-muted">—</span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 text-sm font-semibold text-right tabular-nums text-brand-ink">
                    {formatEuros(f.totalTtc)}
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    {f.resteAPayer > 0.01 ? (
                      <div>
                        <p className="text-sm font-bold tabular-nums text-brand-ink">
                          {formatEuros(f.resteAPayer)}
                        </p>
                        {isRetard && f.penalites > 0 && (
                          <p className="text-xs text-brand-coral-ink tabular-nums mt-0.5" title="Pénalités de retard (15%/an)">
                            +{formatEuros(f.penalites)} pénalités
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="flex items-center justify-end gap-1 text-sm text-brand-pistachio-ink font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Soldée
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3.5">
                    <StatusBadge tone={FACTURE_STATUT_TONE[f.statut]} label={FACTURE_STATUT_LABELS[f.statut]} />
                  </td>

                  <td className="px-5 py-3.5">
                    {canPay(f) && (
                      <button
                        onClick={() => openModal(f)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue hover:bg-brand-ink text-brand-cream rounded-[var(--radius-control)] text-xs font-medium transition-colors whitespace-nowrap"
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
          <p className="px-5 py-12 text-center text-brand-ink-muted text-sm">
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

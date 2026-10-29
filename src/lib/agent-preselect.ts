/**
 * Auto-sélection de l'agent depuis le comédien dans le DevisBuilder
 * (Sprint 2 — UX, ordre retenu n° 1 du 29/10/2026). Logique pure, testable.
 *
 * Quand l'utilisateur change le comédien d'une ligne ARTISTE :
 *   - comédien avec agent connu      → cet agent est pré-sélectionné ;
 *   - comédien « à son compte » / vidé → l'agent est vidé s'il avait été
 *     rempli automatiquement (pas de reste du comédien précédent) ;
 *   - agent choisi à la main sur la ligne → jamais écrasé ;
 *   - agent déjà enregistré (devis existant ouvert en édition) → traité
 *     comme un choix manuel, jamais écrasé.
 *
 * Le déclencheur est le changement de comédien par l'utilisateur, pas le
 * chargement : un devis existant garde ses agents tels qu'enregistrés.
 */

export interface ComedienAgentRef {
  id: string;
  agentId?: string | null;
}

export type AgentPreselectDecision =
  | { change: false }
  /** agentId "" = vider le champ ; auto = l'agent posé est automatique. */
  | { change: true; agentId: string; auto: boolean };

export function decideAgentForComedien(params: {
  /** Nouveau comédien choisi ("" = aucun). */
  comedienId: string;
  comediens: ComedienAgentRef[];
  /** Agents proposés dans la liste déroulante (on ne pose jamais un id absent). */
  knownAgentIds: Set<string>;
  /** Valeur actuelle du champ agent de la ligne ("" / null / undefined = vide). */
  currentAgentId: string | null | undefined;
  /** L'agent actuel a été posé automatiquement par ce helper. */
  agentIsAuto: boolean;
  /** L'utilisateur a modifié l'agent de cette ligne à la main. */
  agentManuallySet: boolean;
}): AgentPreselectDecision {
  const current = params.currentAgentId || "";

  // Choix manuel, ou agent déjà présent qui ne vient pas de nous (devis
  // existant) : on ne touche à rien.
  if (params.agentManuallySet) return { change: false };
  if (current !== "" && !params.agentIsAuto) return { change: false };

  const comedien = params.comedienId
    ? params.comediens.find((c) => c.id === params.comedienId)
    : undefined;
  const target =
    comedien?.agentId && params.knownAgentIds.has(comedien.agentId) ? comedien.agentId : "";

  if (target === current) {
    return target === "" ? { change: false } : { change: true, agentId: target, auto: true };
  }
  return { change: true, agentId: target, auto: target !== "" };
}

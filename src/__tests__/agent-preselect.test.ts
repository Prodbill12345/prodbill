/**
 * Auto-sélection de l'agent depuis le comédien (DevisBuilder).
 * Règle validée par Rose le 29/10/2026 : passer à un comédien « à son
 * compte » vide un agent rempli automatiquement, jamais un agent choisi à
 * la main.
 */

import { decideAgentForComedien } from "../lib/agent-preselect";

const comediens = [
  { id: "alena", agentId: "agence-voix" },
  { id: "bertrand", agentId: "agence-son" },
  { id: "freelance", agentId: null },
  { id: "agent-inconnu", agentId: "agence-supprimee" },
];
const knownAgentIds = new Set(["agence-voix", "agence-son"]);
const base = { comediens, knownAgentIds, agentIsAuto: false, agentManuallySet: false };

describe("decideAgentForComedien", () => {
  test("comédien avec agent, champ agent vide → agent pré-sélectionné (auto)", () => {
    expect(decideAgentForComedien({ ...base, comedienId: "alena", currentAgentId: "" })).toEqual({
      change: true,
      agentId: "agence-voix",
      auto: true,
    });
  });

  test("changement de comédien après une auto-sélection → l'agent suit", () => {
    expect(
      decideAgentForComedien({ ...base, comedienId: "bertrand", currentAgentId: "agence-voix", agentIsAuto: true })
    ).toEqual({ change: true, agentId: "agence-son", auto: true });
  });

  test("passage à un comédien à son compte → l'agent auto est vidé", () => {
    expect(
      decideAgentForComedien({ ...base, comedienId: "freelance", currentAgentId: "agence-voix", agentIsAuto: true })
    ).toEqual({ change: true, agentId: "", auto: false });
  });

  test("comédien vidé → l'agent auto est vidé", () => {
    expect(
      decideAgentForComedien({ ...base, comedienId: "", currentAgentId: "agence-voix", agentIsAuto: true })
    ).toEqual({ change: true, agentId: "", auto: false });
  });

  test("agent choisi à la main → jamais écrasé, même vers un freelance", () => {
    for (const comedienId of ["bertrand", "freelance", ""]) {
      expect(
        decideAgentForComedien({ ...base, comedienId, currentAgentId: "agence-voix", agentManuallySet: true })
      ).toEqual({ change: false });
    }
  });

  test("agent vidé à la main → pas re-rempli au changement de comédien", () => {
    expect(
      decideAgentForComedien({ ...base, comedienId: "alena", currentAgentId: "", agentManuallySet: true })
    ).toEqual({ change: false });
  });

  test("agent déjà enregistré (devis existant) → traité comme manuel", () => {
    expect(
      decideAgentForComedien({ ...base, comedienId: "bertrand", currentAgentId: "agence-voix" })
    ).toEqual({ change: false });
  });

  test("freelance avec champ vide → rien à faire", () => {
    expect(decideAgentForComedien({ ...base, comedienId: "freelance", currentAgentId: null })).toEqual({
      change: false,
    });
  });

  test("agent du comédien absent de la liste → jamais posé (pas d'id invisible)", () => {
    expect(decideAgentForComedien({ ...base, comedienId: "agent-inconnu", currentAgentId: undefined })).toEqual({
      change: false,
    });
  });

  test("comédien inconnu → traité comme sans agent", () => {
    expect(
      decideAgentForComedien({ ...base, comedienId: "fantome", currentAgentId: "agence-voix", agentIsAuto: true })
    ).toEqual({ change: true, agentId: "", auto: false });
  });
});

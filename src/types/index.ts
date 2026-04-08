import type {
  Company,
  User,
  Client,
  Devis,
  DevisSection,
  DevisLigne,
  Facture,
  Paiement,
  BDC,
  AuditLog,
  Role,
  LigneTag,
  DevisStatut,
  FactureType,
  FactureStatut,
} from "@prisma/client";

// Re-export Prisma types
export type {
  Company,
  User,
  Client,
  Devis,
  DevisSection,
  DevisLigne,
  Facture,
  Paiement,
  BDC,
  AuditLog,
  Role,
  LigneTag,
  DevisStatut,
  FactureType,
  FactureStatut,
};

// ─────────────────────────────────────────────
// Permissions RBAC
// ─────────────────────────────────────────────

export type Permission =
  | "devis:read"
  | "devis:create"
  | "devis:edit"
  | "devis:delete"
  | "devis:send"
  | "devis:accept"
  | "facture:read"
  | "facture:create"
  | "facture:emit"  // Rend immuable
  | "client:read"
  | "client:create"
  | "client:edit"
  | "paiement:read"
  | "paiement:create"
  | "parametres:edit"
  | "users:manage";

export const PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    "devis:read", "devis:create", "devis:edit", "devis:delete", "devis:send", "devis:accept",
    "facture:read", "facture:create", "facture:emit",
    "client:read", "client:create", "client:edit",
    "paiement:read", "paiement:create",
    "parametres:edit", "users:manage",
  ],
  DIRECTEUR_PROD: [
    "devis:read", "devis:create", "devis:edit", "devis:send", "devis:accept",
    "facture:read", "facture:create", "facture:emit",
    "client:read", "client:create", "client:edit",
    "paiement:read", "paiement:create",
  ],
  CHARGE_DE_PROD: [
    "devis:read", "devis:create", "devis:edit", "devis:send", "devis:accept",
    "facture:read",
    "client:read", "client:create", "client:edit",
    "paiement:read",
  ],
  COMPTABLE: [
    "devis:read",
    "facture:read", "facture:create", "facture:emit",
    "client:read",
    "paiement:read", "paiement:create",
  ],
  STAGIAIRE: [
    "devis:read", "devis:create",
    "facture:read",
    "client:read",
    "paiement:read",
  ],
};

// ─────────────────────────────────────────────
// Calcul
// ─────────────────────────────────────────────

export interface LigneInput {
  tag: LigneTag;
  quantite: number;
  prixUnit: number;
}

export interface TauxConfig {
  tauxCsComedien: number; // 0.57
  tauxCsTech: number;     // 0.65
  tauxFg: number;         // 0.05 | 0.15
  tauxMarge: number;      // 0.10 | 0.13 | 0.15
}

export interface CalculResult {
  sousTotal: number;
  csComedien: number;
  csTechniciens: number;
  baseMarge: number;
  fraisGeneraux: number;
  marge: number;
  totalHt: number;
  tva: number;
  totalTtc: number;
}

// ─────────────────────────────────────────────
// Types enrichis pour les vues
// ─────────────────────────────────────────────

export type DevisWithRelations = Devis & {
  client: Client;
  sections: (DevisSection & { lignes: DevisLigne[] })[];
};

export type FactureWithRelations = Facture & {
  client: Client;
  devis: Devis | null;
  paiements: Paiement[];
};

export type ClientWithStats = Client & {
  _count: {
    devis: number;
    factures: number;
  };
};

// ─────────────────────────────────────────────
// API Response helpers
// ─────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: string;
  code?: string;
}

// ─────────────────────────────────────────────
// Labels UI
// ─────────────────────────────────────────────

export const LIGNE_TAG_LABELS: Record<LigneTag, string> = {
  ARTISTE: "Artistes",
  TECHNICIEN_HCS: "Technicien.ne.s HCS",
  STUDIO: "Studio",
  MUSIQUE: "Musique",
  AGENT: "Agent (10%)",
};

export const LIGNE_TAG_COLORS: Record<LigneTag, string> = {
  ARTISTE: "bg-purple-100 text-purple-800",
  TECHNICIEN_HCS: "bg-blue-100 text-blue-800",
  STUDIO: "bg-teal-100 text-teal-800",
  MUSIQUE: "bg-pink-100 text-pink-800",
  AGENT: "bg-amber-100 text-amber-800",
};

export const DEVIS_STATUT_LABELS: Record<DevisStatut, string> = {
  BROUILLON: "Brouillon",
  ENVOYE: "Envoyé",
  ACCEPTE: "Accepté",
  REFUSE: "Refusé",
  EXPIRE: "Expiré",
};

export const DEVIS_STATUT_COLORS: Record<DevisStatut, string> = {
  BROUILLON: "bg-gray-100 text-gray-700",
  ENVOYE: "bg-blue-100 text-blue-700",
  ACCEPTE: "bg-green-100 text-green-700",
  REFUSE: "bg-red-100 text-red-700",
  EXPIRE: "bg-orange-100 text-orange-700",
};

export const FACTURE_STATUT_LABELS: Record<FactureStatut, string> = {
  BROUILLON: "Brouillon",
  EMISE: "Émise",
  PAYEE_PARTIEL: "Paiement partiel",
  PAYEE: "Payée",
  EN_RETARD: "En retard",
  ANNULEE: "Annulée",
};

export const FACTURE_STATUT_COLORS: Record<FactureStatut, string> = {
  BROUILLON: "bg-gray-100 text-gray-700",
  EMISE: "bg-blue-100 text-blue-700",
  PAYEE_PARTIEL: "bg-yellow-100 text-yellow-700",
  PAYEE: "bg-green-100 text-green-700",
  EN_RETARD: "bg-red-100 text-red-700",
  ANNULEE: "bg-gray-100 text-gray-500",
};

export const FACTURE_TYPE_LABELS: Record<FactureType, string> = {
  ACOMPTE: "Acompte",
  SOLDE: "Solde",
  AVOIR: "Avoir",
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  DIRECTEUR_PROD: "Directeur de production",
  CHARGE_DE_PROD: "Chargé de production",
  COMPTABLE: "Comptable",
  STAGIAIRE: "Stagiaire",
};

/**
 * scripts/seed-demo.ts
 * Insère des données de démo pour Caleson dans la base Neon.
 *
 * Usage :
 *   npx tsx scripts/seed-demo.ts
 */

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, DevisStatut, FactureType, FactureStatut } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// On importe la fonction de calcul pour avoir des totaux cohérents
// (pas de dépendance Next.js — pure TS)
type LigneTag = "ARTISTE" | "TECHNICIEN_HCS" | "STUDIO" | "MUSIQUE" | "AGENT";

interface LigneInput {
  tag: LigneTag;
  quantite: number;
  prixUnit: number;
  tauxIndexation?: number;
}

interface TauxConfig {
  tauxCsComedien: number;
  tauxCsTech: number;
  tauxFg: number;
  tauxMarge: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calculerDevis(lignes: LigneInput[], taux: TauxConfig, remise = 0) {
  const sousTotal = round2(lignes.reduce((s, l) => s + l.quantite * l.prixUnit, 0));
  const baseComedien = lignes.filter((l) => l.tag === "ARTISTE").reduce((s, l) => s + l.quantite * l.prixUnit, 0);
  const baseTech = lignes.filter((l) => l.tag === "TECHNICIEN_HCS").reduce((s, l) => s + l.quantite * l.prixUnit, 0);
  const csComedien = round2(baseComedien * taux.tauxCsComedien);
  const csTechniciens = round2(baseTech * taux.tauxCsTech);
  const baseMarge = round2(sousTotal + csTechniciens);
  const fraisGeneraux_raw = baseMarge * taux.tauxFg;
  const marge_raw = baseMarge * taux.tauxMarge;
  const fraisGeneraux = round2(fraisGeneraux_raw);
  const marge = round2(marge_raw);
  const indexations = round2(lignes.reduce((s, l) => s + l.quantite * l.prixUnit * ((l.tauxIndexation ?? 0) / 100), 0));
  const totalHt = round2(sousTotal + csComedien + csTechniciens + fraisGeneraux_raw + marge_raw);
  const totalApresRemise = round2(totalHt - round2(remise));
  const tva = round2(totalApresRemise * 0.2);
  const totalTtc = round2(totalApresRemise + tva);
  return { sousTotal, csComedien, csTechniciens, baseMarge, fraisGeneraux, marge, indexations, totalHt, remise: round2(remise), totalApresRemise, tva, totalTtc };
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─────────────────────────────────────────────
// DONNÉES FICTIVES
// ─────────────────────────────────────────────

const CLIENTS = [
  { name: "Quad Productions", siret: "45289631700028", tvaIntra: "FR12452896317", address: "12 rue de la Paix", city: "Paris", postalCode: "75001", email: "compta@quad-prod.fr", phone: "01 42 36 71 00" },
  { name: "Bonne Pioche Télévision", siret: "38914752600041", tvaIntra: "FR98389147526", address: "47 avenue de la Grande Armée", city: "Paris", postalCode: "75016", email: "facturation@bonnepioche.tv", phone: "01 56 43 21 00" },
  { name: "Tetra Media Studio", siret: "52174836900057", tvaIntra: "FR33521748369", address: "3 rue Marcel Proust", city: "Issy-les-Moulineaux", postalCode: "92130", email: "admin@tetramedia.fr", phone: "01 41 23 56 89" },
  { name: "Nightshot Films", siret: "67832145900013", tvaIntra: "FR71678321459", address: "28 rue du Faubourg Saint-Antoine", city: "Paris", postalCode: "75012", email: "production@nightshot.fr", phone: "01 43 07 45 12" },
  { name: "Troisième Œil Productions", siret: "41569823700065", tvaIntra: "FR54415698237", address: "9 rue des Petites Écuries", city: "Paris", postalCode: "75010", email: "compta@troisiemeoeil.fr", phone: "01 48 24 63 90" },
  { name: "Kazak Productions", siret: "79043561200038", tvaIntra: "FR25790435612", address: "15 avenue du Général Leclerc", city: "Boulogne-Billancourt", postalCode: "92100", email: "facturation@kazak.fr", phone: "01 55 38 92 10" },
  { name: "Les Films du Worso", siret: "33812679400022", tvaIntra: "FR87338126794", address: "62 rue Beaubourg", city: "Paris", postalCode: "75003", email: "gestion@filmsduworso.com", phone: "01 44 59 31 00" },
  { name: "Ciné-Valse", siret: "58247013600049", tvaIntra: "FR46582470136", address: "7 passage de la Bonne Graine", city: "Paris", postalCode: "75011", email: "compta@cinevalse.com", phone: "01 43 55 17 82" },
  { name: "Macassar Productions", siret: "44678912300031", tvaIntra: "FR62446789123", address: "20 rue d'Alésia", city: "Paris", postalCode: "75014", email: "contact@macassar.fr", phone: "01 45 39 88 01" },
  { name: "Arche Productions", siret: "61390247500058", tvaIntra: "FR19613902475", address: "5 rue de la Comète", city: "Paris", postalCode: "75007", email: "production@archeprods.fr", phone: "01 53 62 14 30" },
];

interface Section {
  titre: string;
  lignes: Array<{ libelle: string; tag: LigneTag; quantite: number; prixUnit: number }>;
}

const DEVIS_TEMPLATES: Array<{
  objet: string;
  sections: Section[];
  statut: DevisStatut;
}> = [
  {
    objet: "Voix-off documentaire « Mémoires de la Liberté »",
    statut: "ACCEPTE",
    sections: [
      {
        titre: "Artistes",
        lignes: [
          { libelle: "Comédien principal — narration", tag: "ARTISTE", quantite: 1, prixUnit: 1200 },
          { libelle: "Comédienne — interviews reconstruites", tag: "ARTISTE", quantite: 2, prixUnit: 600 },
        ],
      },
      {
        titre: "Studio & technique",
        lignes: [
          { libelle: "Location studio enregistrement — demi-journée", tag: "STUDIO", quantite: 3, prixUnit: 480 },
          { libelle: "Direction artistique", tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 750 },
          { libelle: "Montage son & mixage", tag: "TECHNICIEN_HCS", quantite: 2, prixUnit: 650 },
        ],
      },
    ],
  },
  {
    objet: "Post-production sonore série TV 6×52min",
    statut: "ACCEPTE",
    sections: [
      {
        titre: "Direction sonore",
        lignes: [
          { libelle: "Superviseur son", tag: "TECHNICIEN_HCS", quantite: 6, prixUnit: 1100 },
          { libelle: "Monteur son épisode", tag: "TECHNICIEN_HCS", quantite: 12, prixUnit: 780 },
        ],
      },
      {
        titre: "Studio",
        lignes: [
          { libelle: "Studio Dolby Atmos — journée", tag: "STUDIO", quantite: 6, prixUnit: 2200 },
          { libelle: "Bruitage & ambiances", tag: "STUDIO", quantite: 6, prixUnit: 350 },
        ],
      },
      {
        titre: "Artistes",
        lignes: [
          { libelle: "Comédiens doublage — pool de 8", tag: "ARTISTE", quantite: 6, prixUnit: 2400 },
        ],
      },
    ],
  },
  {
    objet: "Habillage sonore emission quotidienne",
    statut: "ENVOYE",
    sections: [
      {
        titre: "Composition & livraison",
        lignes: [
          { libelle: "Compositeur — thème principal", tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 3500 },
          { libelle: "Jingles & stingers (pack 10)", tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 2200 },
          { libelle: "Musique de fond — 5 variations", tag: "MUSIQUE", quantite: 1, prixUnit: 1800 },
        ],
      },
      {
        titre: "Studio",
        lignes: [
          { libelle: "Enregistrement orchestre de chambre", tag: "STUDIO", quantite: 2, prixUnit: 2800 },
        ],
      },
    ],
  },
  {
    objet: "ADR & post-synchro long métrage",
    statut: "ACCEPTE",
    sections: [
      {
        titre: "Artistes",
        lignes: [
          { libelle: "Acteurs principaux — ADR (5 comédiens)", tag: "ARTISTE", quantite: 5, prixUnit: 900 },
          { libelle: "Walla & foule", tag: "ARTISTE", quantite: 1, prixUnit: 1800 },
        ],
      },
      {
        titre: "Technique",
        lignes: [
          { libelle: "Ingénieur ADR", tag: "TECHNICIEN_HCS", quantite: 4, prixUnit: 850 },
          { libelle: "Studio ADR — journée", tag: "STUDIO", quantite: 4, prixUnit: 1600 },
        ],
      },
    ],
  },
  {
    objet: "Doublage film animation 90min",
    statut: "BROUILLON",
    sections: [
      {
        titre: "Comédiens",
        lignes: [
          { libelle: "Comédien rôle principal", tag: "ARTISTE", quantite: 1, prixUnit: 2500 },
          { libelle: "Comédienne rôle secondaire", tag: "ARTISTE", quantite: 2, prixUnit: 1400 },
          { libelle: "Comédiens rôles de soutien (8)", tag: "ARTISTE", quantite: 8, prixUnit: 650 },
        ],
      },
      {
        titre: "Studio",
        lignes: [
          { libelle: "Studio doublage — demi-journée", tag: "STUDIO", quantite: 8, prixUnit: 950 },
          { libelle: "Direction artistique", tag: "TECHNICIEN_HCS", quantite: 8, prixUnit: 700 },
        ],
      },
    ],
  },
  {
    objet: "Sound design publicité automobile",
    statut: "ENVOYE",
    sections: [
      {
        titre: "Création sonore",
        lignes: [
          { libelle: "Sound designer — conception", tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 4200 },
          { libelle: "Bruiteur — effets spéciaux", tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 2100 },
        ],
      },
      {
        titre: "Enregistrement",
        lignes: [
          { libelle: "Session orchestre — 3h", tag: "STUDIO", quantite: 1, prixUnit: 3600 },
          { libelle: "Voix-off annonceur", tag: "ARTISTE", quantite: 1, prixUnit: 800 },
        ],
      },
    ],
  },
  {
    objet: "Post-prod sonore web série 10 épisodes",
    statut: "ACCEPTE",
    sections: [
      {
        titre: "Montage & mixage",
        lignes: [
          { libelle: "Monteur son — par épisode", tag: "TECHNICIEN_HCS", quantite: 10, prixUnit: 580 },
          { libelle: "Mixeur — par épisode", tag: "TECHNICIEN_HCS", quantite: 10, prixUnit: 720 },
        ],
      },
      {
        titre: "Musique",
        lignes: [
          { libelle: "Compositeur — génériques + underscore", tag: "MUSIQUE", quantite: 1, prixUnit: 3200 },
        ],
      },
    ],
  },
  {
    objet: "Voix-off e-learning — 18 modules",
    statut: "BROUILLON",
    sections: [
      {
        titre: "Comédiens",
        lignes: [
          { libelle: "Comédien principal — FR", tag: "ARTISTE", quantite: 18, prixUnit: 320 },
          { libelle: "Comédienne principale — FR", tag: "ARTISTE", quantite: 18, prixUnit: 320 },
        ],
      },
      {
        titre: "Studio & post",
        lignes: [
          { libelle: "Studio demi-journée", tag: "STUDIO", quantite: 9, prixUnit: 380 },
          { libelle: "Montage audio par module", tag: "TECHNICIEN_HCS", quantite: 18, prixUnit: 180 },
        ],
      },
    ],
  },
  {
    objet: "Mixage Dolby Atmos documentaire cinéma",
    statut: "ACCEPTE",
    sections: [
      {
        titre: "Équipe son",
        lignes: [
          { libelle: "Mixeur Dolby Atmos", tag: "TECHNICIEN_HCS", quantite: 5, prixUnit: 1300 },
          { libelle: "Monteur son ambiances", tag: "TECHNICIEN_HCS", quantite: 5, prixUnit: 850 },
          { libelle: "Monteur son dialogues", tag: "TECHNICIEN_HCS", quantite: 3, prixUnit: 850 },
        ],
      },
      {
        titre: "Studio",
        lignes: [
          { libelle: "Salle Atmos — journée", tag: "STUDIO", quantite: 5, prixUnit: 2400 },
        ],
      },
    ],
  },
  {
    objet: "Création musicale jeu vidéo — OST complète",
    statut: "ENVOYE",
    sections: [
      {
        titre: "Composition",
        lignes: [
          { libelle: "Compositeur principal — 60 min de musique", tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 8500 },
          { libelle: "Compositeur additionnel — ambiances", tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 3200 },
        ],
      },
      {
        titre: "Enregistrement live",
        lignes: [
          { libelle: "Quatuor à cordes — 2 sessions", tag: "STUDIO", quantite: 2, prixUnit: 2800 },
          { libelle: "Soliste piano", tag: "ARTISTE", quantite: 2, prixUnit: 900 },
        ],
      },
      {
        titre: "Post-production",
        lignes: [
          { libelle: "Mastering & livraison stems", tag: "TECHNICIEN_HCS", quantite: 1, prixUnit: 2200 },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function pad(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
  console.log("🎬 Seed démo ProdBill — démarrage\n");

  // 1. Récupérer Caleson
  const company = await prisma.company.findFirst({
    where: { name: { contains: "Caleson", mode: "insensitive" } },
  });

  if (!company) {
    console.error("❌  Société Caleson introuvable en base. Vérifiez que l'onboarding a été complété.");
    process.exit(1);
  }

  console.log(`✅  Société trouvée : ${company.name} (${company.id})\n`);

  // Nettoyage des données de démo existantes (idempotence)
  const demoClientNames = CLIENTS.map((c) => c.name);
  const existingDemoClients = await prisma.client.findMany({
    where: { companyId: company.id, name: { in: demoClientNames } },
    select: { id: true },
  });

  if (existingDemoClients.length > 0) {
    const ids = existingDemoClients.map((c) => c.id);
    console.log(`🧹  Suppression de ${existingDemoClients.length} clients de démo existants (et leurs devis/factures)…`);

    // Supprimer paiements → factures → devis → clients dans le bon ordre
    const factures = await prisma.facture.findMany({ where: { clientId: { in: ids } }, select: { id: true } });
    const factureIds = factures.map((f) => f.id);
    await prisma.paiement.deleteMany({ where: { factureId: { in: factureIds } } });
    await prisma.facture.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.devis.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.client.deleteMany({ where: { id: { in: ids } } });
    console.log("   Nettoyage terminé.\n");
  }

  const taux: TauxConfig = {
    tauxCsComedien: company.defaultTauxCsComedien,
    tauxCsTech: company.defaultTauxCsTech,
    tauxFg: company.defaultTauxFg,
    tauxMarge: company.defaultTauxMarge,
  };

  const snapshotEmetteur = {
    nomEmetteur: company.name,
    adresseEmetteur: [company.address, company.postalCode, company.city].filter(Boolean).join(", "),
    siretEmetteur: company.siret,
    tvaIntraEmetteur: company.tvaIntra,
    ibanEmetteur: company.iban,
    bicEmetteur: company.bic,
    nomBanqueEmetteur: company.nomBanque,
    conditionsPaiement: company.conditionsPaiement,
  };

  // Récupérer un userId valide pour createdById
  const adminUser = await prisma.user.findFirst({ where: { companyId: company.id } });
  if (!adminUser) {
    console.error("❌  Aucun utilisateur trouvé pour cette société.");
    process.exit(1);
  }

  // 2. Créer les clients
  console.log("👥  Création des clients…");
  const clients = await Promise.all(
    CLIENTS.map((c) =>
      prisma.client.create({
        data: { ...c, companyId: company.id },
      })
    )
  );
  console.log(`   ${clients.length} clients créés.\n`);

  // Récupérer (ou initialiser) les compteurs
  const year = new Date().getFullYear();

  async function nextNum(type: "DEVIS" | "FACTURE"): Promise<number> {
    const counter = await prisma.counter.upsert({
      where: { companyId_year_type: { companyId: company!.id, year, type } },
      update: { value: { increment: 1 } },
      create: { companyId: company!.id, year, type, value: 1 },
    });
    return counter.value;
  }

  // 3. Créer les devis
  console.log("📋  Création des devis…");
  const devisIds: string[] = [];
  const devisNumeros: string[] = [];

  for (let i = 0; i < DEVIS_TEMPLATES.length; i++) {
    const tpl = DEVIS_TEMPLATES[i];
    const client = clients[i % clients.length];
    const allLignes = tpl.sections.flatMap((s) => s.lignes);
    const calc = calculerDevis(allLignes, taux);

    const num = await nextNum("DEVIS");
    const shortYear = String(year).slice(-2);
    const numero = `${shortYear}-${pad(num)}`;

    const dateEmission = tpl.statut !== "BROUILLON" ? daysAgo(90 - i * 8) : null;
    const dateValidite = dateEmission ? addDays(dateEmission, 30) : null;

    const devis = await prisma.devis.create({
      data: {
        companyId: company.id,
        clientId: client.id,
        createdById: adminUser.id,
        numero: tpl.statut !== "BROUILLON" ? numero : null,
        objet: tpl.objet,
        statut: tpl.statut,
        tauxCsComedien: taux.tauxCsComedien,
        tauxCsTech: taux.tauxCsTech,
        tauxFg: taux.tauxFg,
        tauxMarge: taux.tauxMarge,
        sousTotal: calc.sousTotal,
        csComedien: calc.csComedien,
        csTechniciens: calc.csTechniciens,
        baseMarge: calc.baseMarge,
        fraisGeneraux: calc.fraisGeneraux,
        marge: calc.marge,
        totalHt: calc.totalHt,
        remise: 0,
        totalApresRemise: calc.totalApresRemise,
        tva: calc.tva,
        totalTtc: calc.totalTtc,
        dateEmission,
        dateValidite,
        sections: {
          create: tpl.sections.map((s, sIdx) => ({
            titre: s.titre,
            ordre: sIdx,
            lignes: {
              create: s.lignes.map((l, lIdx) => ({
                libelle: l.libelle,
                tag: l.tag,
                quantite: l.quantite,
                prixUnit: l.prixUnit,
                total: round2(l.quantite * l.prixUnit),
                ordre: lIdx,
              })),
            },
          })),
        },
      },
    });

    devisIds.push(devis.id);
    devisNumeros.push(numero);
    process.stdout.write(`   [${i + 1}/10] ${tpl.objet.slice(0, 50)} — ${calc.totalTtc.toFixed(2)} € TTC\n`);
  }

  // 4. Créer les factures (uniquement pour les devis ACCEPTE)
  console.log("\n🧾  Création des factures…");

  const factureStatuts: Array<{ type: FactureType; statut: FactureStatut; daysAgoEmission: number }> = [
    { type: "ACOMPTE", statut: "PAYEE",     daysAgoEmission: 70 },
    { type: "SOLDE",   statut: "PAYEE",     daysAgoEmission: 20 },
    { type: "ACOMPTE", statut: "EMISE",     daysAgoEmission: 35 },
    { type: "SOLDE",   statut: "EN_RETARD", daysAgoEmission: 50 },
    { type: "ACOMPTE", statut: "PAYEE",     daysAgoEmission: 60 },
    { type: "SOLDE",   statut: "EMISE",     daysAgoEmission: 10 },
    { type: "ACOMPTE", statut: "PAYEE",     daysAgoEmission: 80 },
    { type: "SOLDE",   statut: "EMISE",     daysAgoEmission: 15 },
    { type: "ACOMPTE", statut: "EN_RETARD", daysAgoEmission: 55 },
    { type: "SOLDE",   statut: "BROUILLON", daysAgoEmission: 0  },
  ];

  const factureIds: string[] = [];
  let factureCount = 0;

  for (let i = 0; i < DEVIS_TEMPLATES.length; i++) {
    const tpl = DEVIS_TEMPLATES[i];
    if (tpl.statut !== "ACCEPTE") continue;

    const allLignes = tpl.sections.flatMap((s) => s.lignes);
    const calc = calculerDevis(allLignes, taux);
    const client = clients[i % clients.length];
    const devisId = devisIds[i];
    const devisNumero = devisNumeros[i];
    const config = factureStatuts[factureCount % factureStatuts.length];
    factureCount++;

    const montantFact = config.type === "ACOMPTE"
      ? round2(calc.totalTtc * 0.5)
      : round2(calc.totalTtc * 0.5);

    const totalHt = round2(montantFact / 1.2);
    const tvaAmt = round2(montantFact - totalHt);

    const num = await nextNum("FACTURE");
    const shortYear = String(year).slice(-2);
    const suffix = config.type === "ACOMPTE" ? "A1" : "S1";
    const numero = `${shortYear}-${pad(num)}-${suffix}`;

    const dateEmission = config.statut !== "BROUILLON" ? daysAgo(config.daysAgoEmission) : null;
    const dateEcheance = dateEmission ? addDays(dateEmission, 45) : null;
    const datePaiement = config.statut === "PAYEE" ? addDays(dateEmission!, 30) : null;
    const emiseAt = dateEmission;

    const facture = await prisma.facture.create({
      data: {
        companyId: company.id,
        clientId: client.id,
        devisId,
        createdById: adminUser.id,
        numero,
        type: config.type,
        statut: config.statut,
        totalHt,
        tva: tvaAmt,
        totalTtc: montantFact,
        dateEmission,
        dateEcheance,
        datePaiement,
        emiseAt,
        ...snapshotEmetteur,
      },
    });

    factureIds.push(facture.id);
    process.stdout.write(`   ${numero} — ${client.name.slice(0, 30)} — ${montantFact.toFixed(2)} € [${config.statut}]\n`);

    // 5. Créer un paiement pour les factures PAYEE
    if (config.statut === "PAYEE" && datePaiement) {
      await prisma.paiement.create({
        data: {
          factureId: facture.id,
          montant: montantFact,
          date: datePaiement,
          reference: `VIR-${devisNumero.replace("-", "")}-${suffix}`,
          mode: "Virement",
          notes: "Règlement reçu",
        },
      });
    }
  }

  // ─────────────────────────────────────────────
  // RÉSUMÉ
  // ─────────────────────────────────────────────
  const totalDevis = await prisma.devis.count({ where: { companyId: company.id } });
  const totalFactures = await prisma.facture.count({ where: { companyId: company.id } });
  const totalPaiements = await prisma.paiement.count({ where: { facture: { companyId: company.id } } });
  const totalClients = await prisma.client.count({ where: { companyId: company.id } });

  const caEncaisse = await prisma.paiement.aggregate({
    where: { facture: { companyId: company.id } },
    _sum: { montant: true },
  });

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Seed démo terminé pour ${company.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Clients     : ${totalClients}
  Devis       : ${totalDevis} (10 nouveaux)
  Factures    : ${totalFactures} (${factureIds.length} nouvelles)
  Paiements   : ${totalPaiements}
  CA encaissé : ${(caEncaisse._sum.montant ?? 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

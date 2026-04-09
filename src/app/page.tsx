"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { DM_Serif_Display, DM_Sans } from "next/font/google";

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const GOLD = "#d4920a";
const BG = "#0a0906";
const CREAM = "#f5f0e8";
const MUTED = "#8a8070";
const SURFACE = "#141210";
const BORDER = "#2a2520";

const FEATURES = [
  {
    icon: "🎬",
    title: "Devis audiovisuels",
    desc: "Comédiens, techniciens HCS, droits, forfaits — chaque ligne au bon taux CS. Calcul temps réel, export PDF.",
  },
  {
    icon: "📄",
    title: "Facturation Factur-X",
    desc: "Factures EN 16931 avec XML ZUGFeRD embarqué. Conformité légale, archivage 10 ans, immuabilité garantie.",
  },
  {
    icon: "🏢",
    title: "Multi-sociétés",
    desc: "Isolation complète par société. Chaque entité a ses taux, ses séquences de numérotation, ses équipes.",
  },
  {
    icon: "💰",
    title: "Suivi paiements",
    desc: "Import relevé bancaire, lettrage, alertes retard à 45 jours. Dashboard CA mensuel par client et projet.",
  },
  {
    icon: "⚡",
    title: "Acomptes & soldes",
    desc: "Générez acompte 50 % et facture de solde depuis un devis accepté en deux clics. BDC automatique.",
  },
  {
    icon: "🔒",
    title: "Conformité RGPD",
    desc: "2FA obligatoire pour Admin et Directeur Prod. Logs d'audit complets. Export et suppression RGPD.",
  },
];

export default function LandingPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isSignedIn) {
      router.push("/devis")
    }
  }, [isSignedIn, router]);

  return (
    <div
      className={`${dmSerif.variable} ${dmSans.variable}`}
      style={{ background: BG, color: CREAM, minHeight: "100vh", fontFamily: "var(--font-dm-sans), sans-serif" }}
    >
      {/* Nav */}
      <nav style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        borderBottom: `1px solid ${BORDER}`,
        background: "rgba(10,9,6,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 2rem",
        height: "60px",
      }}>
        <LogoSvg />
        <Link
          href="/sign-in"
          style={{
            fontSize: "0.875rem",
            fontWeight: 500,
            color: CREAM,
            textDecoration: "none",
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            padding: "6px 16px",
            transition: "border-color 0.2s",
            position: "relative",
            zIndex: 100,
            cursor: "pointer",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
        >
          Connexion
        </Link>
      </nav>

      {/* Hero */}
      <section style={{
        paddingTop: "160px",
        paddingBottom: "120px",
        paddingLeft: "2rem",
        paddingRight: "2rem",
        maxWidth: "900px",
        margin: "0 auto",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "0.75rem",
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: GOLD,
          border: `1px solid ${GOLD}33`,
          borderRadius: "100px",
          padding: "4px 14px",
          marginBottom: "2.5rem",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, display: "inline-block" }} />
          Production audiovisuelle française
        </div>

        <h1 style={{
          fontFamily: "var(--font-dm-serif), serif",
          fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          marginBottom: "1.75rem",
          color: CREAM,
        }}>
          La facturation qui parle{" "}
          <span style={{ color: GOLD, fontStyle: "italic" }}>votre langue</span>
        </h1>

        <p style={{
          fontSize: "clamp(1rem, 2vw, 1.2rem)",
          lineHeight: 1.7,
          color: MUTED,
          maxWidth: "600px",
          margin: "0 auto 3rem",
        }}>
          Devis, acomptes, factures Factur-X — conçu pour les sociétés de production et post-production.
          CS comédiens, techniciens HCS, droits : chaque taux calculé à la virgule.
        </p>

        <Link
          href="/sign-in"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            background: GOLD,
            color: BG,
            fontWeight: 700,
            fontSize: "1rem",
            borderRadius: "12px",
            padding: "14px 32px",
            textDecoration: "none",
            letterSpacing: "-0.01em",
            transition: "opacity 0.2s",
            position: "relative",
            zIndex: 100,
            cursor: "pointer",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          Accéder à ProdBill
          <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
      </section>

      {/* Divider */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "0 2rem" }}>
        <div style={{ height: "1px", background: `linear-gradient(90deg, transparent, ${BORDER}, transparent)` }} />
      </div>

      {/* Features */}
      <section style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "100px 2rem",
      }}>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), serif",
          fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
          letterSpacing: "-0.02em",
          marginBottom: "0.75rem",
          textAlign: "center",
        }}>
          Tout ce dont une prod a besoin
        </h2>
        <p style={{ color: MUTED, textAlign: "center", marginBottom: "3.5rem", fontSize: "0.95rem" }}>
          Pas d'usine à gaz — exactement les bons outils, dans le bon ordre.
        </p>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1.5rem",
        }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: "16px",
                padding: "1.75rem",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = `${GOLD}55`)}
              onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = BORDER)}
            >
              <div style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>{f.icon}</div>
              <h3 style={{
                fontFamily: "var(--font-dm-serif), serif",
                fontSize: "1.1rem",
                marginBottom: "0.5rem",
                color: CREAM,
              }}>
                {f.title}
              </h3>
              <p style={{ fontSize: "0.875rem", lineHeight: 1.65, color: MUTED }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA bottom */}
      <section style={{
        textAlign: "center",
        padding: "80px 2rem 120px",
        borderTop: `1px solid ${BORDER}`,
      }}>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), serif",
          fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
          letterSpacing: "-0.02em",
          marginBottom: "2rem",
        }}>
          Prêt à facturer <span style={{ color: GOLD, fontStyle: "italic" }}>sans friction</span> ?
        </h2>
        <Link
          href="/sign-in"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            background: GOLD,
            color: BG,
            fontWeight: 700,
            fontSize: "1rem",
            borderRadius: "12px",
            padding: "14px 32px",
            textDecoration: "none",
            transition: "opacity 0.2s",
            position: "relative",
            zIndex: 100,
            cursor: "pointer",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          Accéder à ProdBill
          <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${BORDER}`,
        padding: "1.5rem 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}>
        <LogoSvg small />
        <span style={{ fontSize: "0.75rem", color: MUTED }}>
          © {new Date().getFullYear()} ProdBill — Facturation audiovisuelle française
        </span>
      </footer>
    </div>
  );
}

function LogoSvg({ small }: { small?: boolean }) {
  const scale = small ? 0.75 : 1;
  const w = 140 * scale;
  const h = 36 * scale;
  return (
    <svg width={w} height={h} viewBox="0 0 140 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Pellicule — bande gauche */}
      <rect x="0" y="0" width="10" height="36" rx="2" fill="#1a1612" />
      {[4, 10, 16, 22, 28].map((y) => (
        <rect key={y} x="2" y={y} width="6" height="4" rx="1" fill="#0a0906" />
      ))}
      {/* Pellicule — bande droite */}
      <rect x="130" y="0" width="10" height="36" rx="2" fill="#1a1612" />
      {[4, 10, 16, 22, 28].map((y) => (
        <rect key={y} x="132" y={y} width="6" height="4" rx="1" fill="#0a0906" />
      ))}
      {/* Texte Prod italic doré */}
      <text
        x="18"
        y="25"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="400"
        fontSize="22"
        fill={GOLD}
        letterSpacing="-0.5"
      >
        Prod
      </text>
      {/* Texte Bill crème */}
      <text
        x="72"
        y="25"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="22"
        fill={CREAM}
        letterSpacing="-0.5"
      >
        Bill
      </text>
    </svg>
  );
}

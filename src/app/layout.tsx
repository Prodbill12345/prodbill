import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// DA ProdBill (C-REDESIGN-PHASE2-APP) : DM Sans pour le texte (font-sans),
// Space Grotesk pour titres et chiffres (font-display). Polices variables :
// toutes les graisses disponibles. Inter retirée à l'étape 2.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ProdBill — Facturation audiovisuelle",
  description: "Logiciel de facturation et gestion financière pour la production audiovisuelle",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="fr" className={`${spaceGrotesk.variable} ${dmSans.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}

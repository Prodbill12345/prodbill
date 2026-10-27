import type { Metadata } from "next";
import { Inter, Space_Grotesk, DM_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// DA ProdBill (C-REDESIGN-PHASE2-APP) : chargées et exposées en variables
// CSS dès l'étape 1, appliquées à partir de l'étape 2 (le body reste en Inter
// d'ici là). Polices variables : toutes les graisses disponibles.
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
      <html lang="fr" className={`${inter.variable} ${spaceGrotesk.variable} ${dmSans.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}

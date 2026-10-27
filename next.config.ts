import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Polices des PDF clients (C-REDESIGN-PHASE1-PDF), lues sur disque par
  // src/lib/pdf/fonts.ts : à embarquer dans les fonctions des routes qui
  // génèrent des PDF (devis, facture, Factur-X, envois email).
  outputFileTracingIncludes: {
    "/api/**": ["./src/assets/fonts/**/*.ttf"],
  },
};

export default nextConfig;

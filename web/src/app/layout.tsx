import type { Metadata } from "next";
import { Cairo, Tajawal } from "next/font/google";
import "./globals.css";

/**
 * Phase 18.1 — Finquiz Visual Identity Foundation: typography pairing
 * ported from Finquiz's styles.css (Cairo for headings/brand/buttons,
 * Tajawal for body text), loaded via next/font for self-hosting +
 * automatic subsetting instead of a runtime Google Fonts <link>.
 */
const cairo = Cairo({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-heading",
  display: "swap",
});

const tajawal = Tajawal({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Digital Leadership",
  description: "Educational platform (scaffolding phase — no business logic implemented yet).",
  icons: { icon: "/favicon.webp" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cairo.variable} ${tajawal.variable}`}>
      <body>{children}</body>
    </html>
  );
}

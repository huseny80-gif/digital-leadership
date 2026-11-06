import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import "./reference-dashboard.css";
import "./quiz-training.css";
import "./content-automation.css";
import "./participant-feedback.css";
import "./learning-dashboard.css";
import "./training-access.css";

export const metadata: Metadata = {
  title: "القيادة الرقمية | Digital Leadership",
  description: "منصة تعليمية تفاعلية تقدم محتوى دبلوم القيادة الرقمية بأسلوب تفاعلي حديث ومرن، لدعم بناء قدرات القادة.",
  icons: { icon: "/favicon.webp" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request CSP nonces also cover public login/join pages. Static HTML
  // cannot contain the current request's nonce.
  await connection();
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Leadership",
  description: "Educational platform (scaffolding phase — no business logic implemented yet).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

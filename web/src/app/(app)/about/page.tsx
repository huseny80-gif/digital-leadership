import { aboutProfile, contactInfo, comingSoonChannels } from "@/config/about";

/**
 * "من نحن" (About) — static, public, informational page. Not an
 * authentication surface: the person described here is not turned into
 * any kind of user/session identifier, and this page does not touch
 * Google OAuth, RBAC, Supabase auth, or the session system in any way.
 *
 * Image: `aboutProfile.photoPath` resolves to
 * `web/public/about/hussein-profile.webp`, copied byte-for-byte from the
 * verified source (`Finquiz`'s `assets/img/hussein-profile.webp`,
 * 480x575 WebP) — confirmed identical via `cmp`.
 */
export default function AboutPage() {
  return (
    <main dir="rtl" style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6)", background: "var(--color-bg)" }}>
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow)",
          padding: "var(--space-6)",
        }}
      >
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 var(--space-4)", color: "var(--color-text)" }}>من نحن</h1>

        <div style={{ display: "flex", gap: "var(--space-5)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--space-5)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static profile photo, not part of the Next.js image optimization pipeline used elsewhere */}
          <img
            src={aboutProfile.photoPath}
            alt={aboutProfile.name}
            width={120}
            height={120}
            style={{ borderRadius: "50%", objectFit: "cover", border: "1px solid var(--color-border)" }}
          />
          <div>
            <p style={{ margin: 0, fontSize: "var(--font-size-lg)", fontWeight: 700, color: "var(--color-text)" }}>{aboutProfile.name}</p>
            <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-muted)" }}>{aboutProfile.jobTitle}</p>
            <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-muted)" }}>{aboutProfile.role}</p>
          </div>
        </div>

        <p style={{ color: "var(--color-text)", marginBottom: "var(--space-4)" }}>{aboutProfile.bio}</p>

        <ul style={{ margin: "0 0 var(--space-5)", paddingInlineStart: "1.25rem", color: "var(--color-text-muted)" }}>
          {aboutProfile.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>

        <h2 style={{ fontSize: "var(--font-size-lg)", margin: "0 0 var(--space-3)", color: "var(--color-text)" }}>تواصل معنا</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
          <li>
            <a href={`tel:${contactInfo.phone}`} style={{ color: "var(--color-primary)" }}>
              الهاتف: {contactInfo.phone}
            </a>
          </li>
          <li>
            <a href={`https://wa.me/${contactInfo.whatsapp}`} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>
              واتساب
            </a>
          </li>
          <li>
            <a href={`mailto:${contactInfo.email}`} style={{ color: "var(--color-primary)" }}>
              البريد الإلكتروني: {contactInfo.email}
            </a>
          </li>
          {comingSoonChannels.map((channel) => (
            <li key={channel} style={{ color: "var(--color-text-muted)" }}>
              {channel} — قريباً
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

import type { ReactNode } from "react";

export interface GlassCardProps {
  title?: string;
  className?: string;
  interactive?: boolean;
  children: ReactNode;
  "aria-label"?: string;
}

export function GlassCard({ title, className = "", interactive = false, children, ...rest }: GlassCardProps) {
  const headingId = title ? `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined;
  return (
    <section
      className={`glass ${interactive ? "interactive" : ""} ${className}`.trim()}
      aria-labelledby={headingId}
      aria-label={headingId ? undefined : rest["aria-label"]}
    >
      {title && <h2 id={headingId} className="glass-title">{title}</h2>}
      {children}
    </section>
  );
}

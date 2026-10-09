import type { ReactNode } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

export function DashboardDisclosure({
  id,
  title,
  icon,
  count,
  busy,
  className = "",
  children,
}: {
  id: string;
  title: string;
  icon: string;
  count: string;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`dl-preview-panel dl-dashboard-disclosure ${className}`}
      id={id}
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
    >
      <details>
        <summary className="dl-disclosure-summary">
          <h2 id={`${id}-title`}>
            <PlatformIcon name={icon} />
            <span className="dl-disclosure-title">{title}</span>
            <span className="dl-disclosure-count">{count}</span>
            <PlatformIcon name="chevron" className="dl-disclosure-chevron" />
          </h2>
        </summary>
        <div className="dl-disclosure-body">{children}</div>
      </details>
    </section>
  );
}

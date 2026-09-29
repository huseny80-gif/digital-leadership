import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/** Accessible breadcrumb trail — the current page is marked with
 * `aria-current="page"` and is not a link (WEB_APPLICATION_ARCHITECTURE.md
 * "Accessibility"). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`}>
            {index > 0 ? <span aria-hidden="true"> / </span> : null}
            {isLast || !item.href ? (
              <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
            ) : (
              <Link href={item.href}>{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

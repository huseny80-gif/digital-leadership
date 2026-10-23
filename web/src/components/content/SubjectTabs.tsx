"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { SubjectTabDef } from "./subjectTabs.config";
import { isStudyModuleDocument } from "./studyModules";

export type { SubjectTabDef } from "./subjectTabs.config";
export { subjectTabs } from "./subjectTabs.config";

/** Keep route navigation for app pages and native navigation for public HTML.
 * Definitions stay in a plain module shared by server and client components. */
export function SubjectTabs({ tabs, activeKey }: { tabs: SubjectTabDef[]; activeKey?: string }) {
  const pathname = usePathname();
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current;
    const selected = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !selected || nav.scrollWidth <= nav.clientWidth) return;
    const bounds = nav.getBoundingClientRect(), tab = selected.getBoundingClientRect();
    if (tab.left < bounds.left) nav.scrollLeft += tab.left - bounds.left - 12;
    else if (tab.right > bounds.right) nav.scrollLeft += tab.right - bounds.right + 12;
  }, [pathname, activeKey, tabs]);

  return (
    <nav ref={navigation} className="section-tabs" aria-label="أقسام المادة">
      {tabs.map((tab) => {
        const TabLink = isStudyModuleDocument(tab.href) ? "a" : Link;
        return <TabLink
          key={tab.key}
          href={tab.href}
          className="section-tab"
          aria-current={(activeKey ? tab.key === activeKey : pathname === tab.href) ? "page" : undefined}
        >
          <span aria-hidden="true">{tab.icon}</span> {tab.label}
          {typeof tab.count === "number" ? (
            <span className="section-tab-count">{tab.count}</span>
          ) : null}
        </TabLink>;
      })}
    </nav>
  );
}

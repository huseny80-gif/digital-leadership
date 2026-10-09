"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import type { NavItem } from "./MobileNav";
import styles from "./footerNavigate.module.css";

export function FooterNavigate({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const NavigationLink = pathname.startsWith("/quizzes/") ? "a" : Link;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  return <div ref={wrapper} className={styles.wrapper} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} type="button" className={styles.trigger} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} onKeyDown={event => {
      if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); requestAnimationFrame(() => wrapper.current?.querySelector<HTMLAnchorElement>("nav a")?.focus()); }
    }}>Navigate <PlatformIcon name="chevron" /></button>
    {open ? <nav id={id} className={styles.panel} aria-label="روابط Navigate">{items.map(item => <NavigationLink key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setOpen(false)}>{item.icon ? <PlatformIcon name={item.icon} /> : null}<span>{item.label}</span></NavigationLink>)}</nav> : null}
  </div>;
}

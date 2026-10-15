import Link from "next/link";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

export function StudyDirectoryTabs({ active = "subjects" }: { active?: "subjects" | "pdf" }) {
  return <nav className="section-tabs" aria-label="تصفح المواد والملفات">
    <Link href="/subjects" className="section-tab" aria-current={active === "subjects" ? "page" : undefined}><PlatformIcon name="book" /> المواد الدراسية</Link>
    <Link href="/subjects/pdf" className="section-tab" aria-current={active === "pdf" ? "page" : undefined}><PlatformIcon name="folder" /> PDF</Link>
  </nav>;
}

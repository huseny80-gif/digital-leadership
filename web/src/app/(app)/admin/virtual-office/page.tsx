import { VirtualOfficeGrid } from "@/components/virtual-office/VirtualOfficeGrid";
import { VirtualOfficeSummary } from "@/components/virtual-office/VirtualOfficeSummary";
import { VirtualOfficeAutoRefresh } from "@/components/virtual-office/VirtualOfficeAutoRefresh";

export const metadata = { title: "المكتب الافتراضي | لوحة الإدارة" };
export const dynamic = "force-dynamic";

export interface OfficeEmployee {
  id: string;
  name: string;
  role: string;
  status: "idle" | "working" | "offline" | "meeting";
  current_task: string | null;
  last_updated?: string;
}

export interface OfficeState {
  employees: Record<string, OfficeEmployee>;
  last_updated: string | null;
}

async function fetchOfficeState(): Promise<OfficeState | null> {
  const officeUrl = process.env.OFFICE_STATE_URL ?? "http://localhost:5050/api/state";
  try {
    const res = await fetch(officeUrl, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return (await res.json()) as OfficeState;
  } catch {
    return null;
  }
}

export default async function VirtualOfficePage() {
  const state = await fetchOfficeState();

  if (!state) {
    return (
      <div className="vo-page" dir="rtl">
        <header className="vo-header">
          <h1 className="vo-title">🏢 المكتب الافتراضي</h1>
        </header>
        <div className="vo-offline-banner">
          <span className="vo-offline-icon">⚠️</span>
          <p>خادم المكتب غير متاح حالياً. تأكد من تشغيل <code>./start.sh</code> في مجلد <code>virtual-office/</code>.</p>
        </div>
      </div>
    );
  }

  const employees = Object.entries(state.employees).map(([id, emp]) => ({
    ...emp,
    id,
  }));

  return (
    <div className="vo-page" dir="rtl">
      <header className="vo-header">
        <div className="vo-header-text">
          <h1 className="vo-title">🏢 المكتب الافتراضي</h1>
          {state.last_updated && (
            <p className="vo-last-updated">
              آخر تحديث: {new Date(state.last_updated).toLocaleTimeString("ar-SA")}
            </p>
          )}
        </div>
        <VirtualOfficeSummary employees={employees} />
      </header>

      <VirtualOfficeAutoRefresh />
      <VirtualOfficeGrid employees={employees} />
    </div>
  );
}

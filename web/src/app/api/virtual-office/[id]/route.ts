import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const baseUrl = process.env.OFFICE_STATE_URL ?? "http://localhost:5050/api/state";
  const tasksUrl = baseUrl.replace(/\/api\/state\/?$/, `/api/tasks/${id}`);

  try {
    const res = await fetch(tasksUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return NextResponse.json({ error: "state server error" }, { status: 502 });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "state server unreachable" }, { status: 503 });
  }
}

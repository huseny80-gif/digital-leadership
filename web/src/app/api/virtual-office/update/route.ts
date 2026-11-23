import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.id || !body.status) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }

  const validStatuses = ["idle", "working", "meeting", "offline"];
  if (!validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const baseUrl = process.env.OFFICE_STATE_URL ?? "http://localhost:5050/api/state";
  const url = baseUrl.replace(/\/api\/state\/?$/, `/api/state/${body.id}`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: body.status, current_task: body.current_task ?? null }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "state server error" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "state server unreachable" }, { status: 503 });
  }
}

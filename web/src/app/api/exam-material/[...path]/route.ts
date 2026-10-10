import { NextResponse } from "next/server";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { apiGetDownload } from "@/lib/api/download";
import { ACADEMIC_VOICES } from "@digital-leadership/shared";

type Context = { params: Promise<{ path: string[] }> };
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function GET(request: Request, context: Context) {
  const { path } = await context.params;
  const revisions = path.length === 3 && uuid.test(path[0]!) && uuid.test(path[1]!) && path[2] === "revisions";
  const download = path.length === 3 && uuid.test(path[0]!) && uuid.test(path[1]!) && path[2] === "review-package.pdf";
  const audio = path.length === 3 && uuid.test(path[0]!) && uuid.test(path[1]!) && path[2] === "audio.mp3";
  const narrationText = path.length === 3 && uuid.test(path[0]!) && uuid.test(path[1]!) && path[2] === "review-narration.txt";
  const narrationJson = path.length === 3 && uuid.test(path[0]!) && uuid.test(path[1]!) && path[2] === "review-narration.json";
  const allowed = (path.length === 1 && uuid.test(path[0]!))
    || (path.length === 2 && path.every(p => uuid.test(p)))
    || revisions || download || audio || narrationText || narrationJson
    || (path.length === 4 && uuid.test(path[0]!) && uuid.test(path[1]!) && path[2] === "attempts" && uuid.test(path[3]!));
  if (!allowed) return NextResponse.json({ error: { code: "not_found", message: "المحتوى غير متاح." } }, { status: 404, headers });
  const query = new URL(request.url).searchParams;
  const paginated = path.length === 1 || revisions;
  const audioValid = audio && query.size === 3 && ["chapter", "segment", "voice"].every(key => query.getAll(key).length === 1) && (query.get("chapter") === "introduction" || uuid.test(query.get("chapter") ?? "")) && /^(?:0|[1-9]\d{0,4})$/.test(query.get("segment") ?? "") && ACADEMIC_VOICES.some(voice => voice.id === query.get("voice"));
  const range = request.headers.get("range");
  if (audio ? !audioValid || (range !== null && !/^bytes=\d*-\d*$/.test(range)) : [...query.keys()].some(key => !["page", "limit"].includes(key)) || (!paginated && query.size)) return NextResponse.json({ error: { code: "validation_error", message: "بيانات الطلب غير صالحة." } }, { status: 400, headers });
  const suffix = path.slice(1).join("/");
  const qs = paginated && query.size ? `?${query}` : "";
  try {
    if (audio) {
      const response = await apiGetDownload(`/api/v1/subjects/${path[0]}/exam-material/${path[1]}/audio.mp3?${query}`, range ? { range } : undefined);
      if (!response.headers.get("content-type")?.includes("audio/mpeg")) throw new Error("Invalid audio response");
      const audioHeaders: Record<string, string> = { ...headers, "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes" };
      for (const key of ["Content-Length", "Content-Range", "X-Audio-Voice", "X-Narration-Version"]) { const value = response.headers.get(key); if (value) audioHeaders[key] = value; }
      return new Response(response.body, { status: response.status, headers: audioHeaders });
    }
    if (narrationText) {
      const response = await apiGetDownload(`/api/v1/subjects/${path[0]}/exam-material/${path[1]}/review-narration.txt`);
      if (!response.headers.get("content-type")?.includes("text/plain")) throw new Error("Invalid narration response");
      return new Response(response.body, { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": response.headers.get("content-disposition") ?? 'attachment; filename="digital-leadership-academic-narration.txt"' } });
    }
    if (download) {
      const response = await apiGetDownload(`/api/v1/subjects/${path[0]}/exam-material/${path[1]}/review-package.pdf`);
      if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Invalid PDF response");
      return new Response(response.body, { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="digital-leadership-exam-review.pdf"' } });
    }
    return NextResponse.json(await apiGet(`/api/v1/subjects/${path[0]}/exam-material${suffix ? `/${suffix}` : ""}${qs}`), { headers });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json(error.body, { status: error.status, headers });
    return NextResponse.json({ error: { code: "internal_error", message: audio ? "تعذر تحميل الصوت. أعد المحاولة أو اختر صوتًا آخر." : "تعذر تحميل المادة الامتحانية. حاول مرة أخرى." } }, { status: 500, headers });
  }
}

export async function POST(request: Request, context: Context) {
  const { path } = await context.params;
  if (path.length !== 3 || !uuid.test(path[0]!) || !uuid.test(path[1]!) || path[2] !== "attempts") return NextResponse.json({ error: { code: "not_found", message: "المحتوى غير متاح." } }, { status: 404, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "validation_error", message: "اختر وضع الاختبار." } }, { status: 400, headers }); }
  if (new URL(request.url).searchParams.size || !body || typeof body !== "object" || Object.keys(body).length !== 1 || !("mode" in body) || !["learning", "challenge"].includes(String(body.mode))) return NextResponse.json({ error: { code: "validation_error", message: "بيانات وضع الاختبار غير صالحة." } }, { status: 400, headers });
  try { return NextResponse.json(await apiPost(`/api/v1/subjects/${path[0]}/exam-material/${path[1]}/attempts`, body), { status: 201, headers }); }
  catch (error) {
    if (error instanceof ApiError) return NextResponse.json(error.body, { status: error.status, headers });
    return NextResponse.json({ error: { code: "internal_error", message: "تعذر بدء الاختبار. حاول مرة أخرى." } }, { status: 500, headers });
  }
}

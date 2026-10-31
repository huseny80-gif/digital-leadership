import { NextResponse } from "next/server";
import { apiGet, ApiError } from "@/lib/api/client";
import { apiGetDownload } from "@/lib/api/download";
import { STUDY_COURSES, STUDY_VOICES } from "@digital-leadership/shared";

export const maxDuration = 120;
type Context = { params: Promise<{ path: string[] }> };
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function GET(request: Request, context: Context) {
  const { path } = await context.params;
  const course = STUDY_COURSES.some(item => item.id === path[0]);
  const document = path.length === 2 && ["summaries", "exam"].includes(path[1]!);
  const audio = path.length === 3 && uuid.test(path[1]!) && path[2] === "audio.mp3";
  if (!course || (!document && !audio)) return NextResponse.json({ error: { code: "not_found", message: "المحتوى غير متاح لهذه المادة." } }, { status: 404, headers });
  const query = new URL(request.url).searchParams;
  const range = request.headers.get("range");
  const validAudio = query.size === 2 && query.getAll("voice").length === 1 && query.getAll("revision").length === 1
    && STUDY_VOICES.some(voice => voice.id === query.get("voice")) && /^[a-f0-9]{64}$/.test(query.get("revision") ?? "")
    && (range === null || /^bytes=\d*-\d*$/.test(range));
  if (audio ? !validAudio : query.size > 0 || range !== null) return NextResponse.json({ error: { code: "validation_error", message: "بيانات الطلب غير صالحة." } }, { status: 400, headers });
  const endpoint = `/api/v1/subjects/${path[0]}/study-modules/${path.slice(1).join("/")}`;
  try {
    if (!audio) return NextResponse.json(await apiGet(endpoint), { headers });
    const response = await apiGetDownload(`${endpoint}?${query}`, { ...(range ? { range } : {}), timeoutMs: 110_000 });
    if (!response.headers.get("content-type")?.includes("audio/mpeg")) throw new Error("Invalid narration response");
    const audioHeaders: Record<string, string> = { ...headers, "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes" };
    for (const key of ["Content-Length", "Content-Range", "X-Audio-Voice", "X-Narration-Version"]) { const value = response.headers.get(key); if (value) audioHeaders[key] = value; }
    return new Response(response.body, { status: response.status, headers: audioHeaders });
  } catch (error) {
    if (error instanceof ApiError) {
      const rangeHeaders: Record<string, string> = audio && error.status === 416 && /^bytes \*\/\d+$/.test(error.contentRange ?? "") ? { "Content-Range": error.contentRange!, "Accept-Ranges": "bytes" } : {};
      return NextResponse.json(error.body, { status: error.status, headers: { ...headers, ...rangeHeaders } });
    }
    return NextResponse.json({ error: { code: "internal_error", message: audio ? "تعذر تجهيز الصوت. أعد المحاولة أو اختر صوتًا آخر." : "تعذر تحميل محتوى المادة. أعد المحاولة." } }, { status: 500, headers });
  }
}

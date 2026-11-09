import { STUDY_COURSES, STUDY_VOICES, type StudyModuleLecture, type StudySummaryDocument } from "@digital-leadership/shared";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const checksum = /^[a-f0-9]{64}$/;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export class StudyContentError extends Error {
  constructor(public readonly code: "unavailable" | "session" | "changed" | "invalid" | "audio", message: string) { super(message); }
}

/** Do not render another course, a duplicated lecture or an injected source/audio URL. */
export function parseSubjectSummaries(value: unknown, subjectId: string): StudySummaryDocument {
  const invalid = () => new StudyContentError("invalid", "تعذر مطابقة الملخصات مع هذه المادة. حدّث الصفحة أو أعد المحاولة.");
  if (!STUDY_COURSES.some(course => course.id === subjectId) || !record(value) || value.live !== true || value.subjectId !== subjectId
    || !text(value.courseTitle) || !text(value.revision) || !checksum.test(value.revision)
    || !Array.isArray(value.lectures) || !Array.isArray(value.voices) || !Array.isArray(value.unavailableLectures)) throw invalid();
  if (value.voices.length !== STUDY_VOICES.length || value.voices.some((voice, index) => !record(voice) || voice.id !== STUDY_VOICES[index]?.id || !text(voice.label))) throw invalid();
  const ids = new Set(), numbers = new Set(), lectureIds = new Set();
  for (const lecture of value.lectures) {
    if (!record(lecture) || !text(lecture.id) || !/^[a-z]+-\d{2,3}$/.test(lecture.id) || ids.has(lecture.id)
      || lecture.catalogId !== undefined && (!text(lecture.catalogId) || !/^[a-z][a-z0-9-]{0,79}$/.test(lecture.catalogId))
      || !text(lecture.lectureId) || !uuid.test(lecture.lectureId) || lectureIds.has(lecture.lectureId)
      || !Number.isInteger(lecture.number) || (lecture.number as number) < 1 || numbers.has(lecture.number)
      || !text(lecture.title) || !text(lecture.filename) || !text(lecture.sha256) || !checksum.test(lecture.sha256)
      || !text(lecture.summarySha256) || !checksum.test(lecture.summarySha256) || !text(lecture.transcript)
      || !text(lecture.overview) || !Array.isArray(lecture.sections) || !lecture.sections.length) throw invalid();
    if (lecture.sourceHref !== `/subjects/${subjectId}/lectures/${lecture.lectureId}`
      || lecture.audioUrl !== `/api/study-modules/${subjectId}/${lecture.lectureId}/audio.mp3?revision=${lecture.summarySha256}`) throw invalid();
    if (lecture.sections.some(section => !record(section) || !text(section.heading) || !Array.isArray(section.points) || !section.points.length
      || section.points.some(point => !record(point) || !text(point.term) || !text(point.text)))) throw invalid();
    ids.add(lecture.id); numbers.add(lecture.number); lectureIds.add(lecture.lectureId);
  }
  if (value.unavailableLectures.some(item => !record(item) || !text(item.lectureId) || !uuid.test(item.lectureId) || !text(item.title) || !text(item.reason))) throw invalid();
  return value as unknown as StudySummaryDocument;
}

export function studyRetryDelay(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return (Number.isFinite(seconds) && seconds >= 1 ? Math.min(seconds, 10) : 10) * 1000;
}

export function waitForStudyRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

function responseError(status: number, audio: boolean): StudyContentError {
  if (status === 401 || status === 403) return new StudyContentError("session", "انتهت صلاحية الدخول. ادخل إلى المنصة مجددًا ثم افتح هذه المادة.");
  if (status === 409) return new StudyContentError("changed", "تغيّر ملخص المحاضرة. حدّث الملخص للاستماع إلى التسجيل المطابق.");
  if (status === 404) return new StudyContentError("unavailable", audio ? "تسجيل هذه المحاضرة غير متاح حاليًا. حدّث الملخص ثم أعد المحاولة." : "ملخصات هذه المادة غير متاحة حاليًا.");
  return new StudyContentError(audio ? "audio" : "unavailable", audio ? "تعذر تجهيز التسجيل. أعد المحاولة أو اختر صوتًا آخر." : "تعذر تحميل ملخصات هذه المادة. أعد المحاولة.");
}

async function prepareResponse(url: string, preparingCode: string, signal: AbortSignal, onPreparing: () => void): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal });
    if (response.ok) return response;
    const body: unknown = await response.json().catch(() => null);
    const preparing = record(body) && record(body.error) && body.error.code === preparingCode;
    if (response.status !== 503 || !preparing || attempt >= 8) throw responseError(response.status, preparingCode === "audio_preparing");
    onPreparing();
    await waitForStudyRetry(studyRetryDelay(response), signal);
  }
}

export async function loadSubjectSummaries(subjectId: string, signal: AbortSignal, onPreparing: () => void): Promise<StudySummaryDocument> {
  if (!STUDY_COURSES.some(course => course.id === subjectId)) throw responseError(404, false);
  const response = await prepareResponse(`/api/study-modules/${subjectId}/summaries`, "study_module_preparing", signal, onPreparing);
  const envelope: unknown = await response.json();
  return parseSubjectSummaries(record(envelope) ? envelope.data : null, subjectId);
}

export function lecturePodcastUrl(lecture: StudyModuleLecture, voiceId: string): string {
  if (!STUDY_VOICES.some(voice => voice.id === voiceId)) throw new StudyContentError("audio", "اختر صوتًا من الأصوات المتاحة.");
  return `${lecture.audioUrl}&voice=${encodeURIComponent(voiceId)}`;
}

export async function loadLecturePodcast(lecture: StudyModuleLecture, voiceId: string, signal: AbortSignal, onPreparing: () => void): Promise<Blob> {
  const response = await prepareResponse(lecturePodcastUrl(lecture, voiceId), "audio_preparing", signal, onPreparing);
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("audio/mpeg")) throw responseError(503, true);
  const blob = await response.blob();
  if (blob.size < 128) throw responseError(503, true);
  return blob;
}

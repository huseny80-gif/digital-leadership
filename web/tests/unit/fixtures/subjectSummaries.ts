import { STUDY_COURSES, STUDY_VOICES, type StudySummaryDocument } from "@digital-leadership/shared";

/** Local UI fixture only; real curriculum coverage is checked by backend PDF tests. */
export function summaryFixture(subjectId = STUDY_COURSES.find(course => course.slug === "risk-management")!.id as string, count = 6): StudySummaryDocument {
  const course = STUDY_COURSES.find(course => course.id === subjectId)!;
  return {
    live: true, subjectId, courseTitle: `مقرر تجريبي — ${course.slug}`, revision: "a".repeat(64),
    voices: STUDY_VOICES.map(({ id, label }) => ({ id, label })), unavailableLectures: [],
    lectures: Array.from({ length: count }, (_, index) => {
      const number = index + 1, lectureId = `${String(number).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
      const summarySha256 = String(number).padStart(64, "b");
      return { id: `${course.anchor}-${String(number).padStart(2, "0")}`, lectureId, number, title: `المحاضرة ${number} — بيانات تجريبية`, filename: `ملف تجريبي ${number}.pdf`, sha256: "c".repeat(64),
        sourceHref: `/subjects/${subjectId}/lectures/${lectureId}`, overview: `تمهيد تجريبي للمحاضرة ${number}.`,
        sections: [{ heading: `المحور التجريبي ${number}`, points: [{ term: `المفهوم ${number}`, text: `شرح أكاديمي تجريبي خاص بالمحاضرة ${number}.` }] }],
        transcript: `نص تجريبي للمحاضرة ${number}.`, summarySha256, audioUrl: `/api/study-modules/${subjectId}/${lectureId}/audio.mp3?revision=${summarySha256}` };
    }),
  };
}

export const jsonResponse = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
export const audioResponse = () => new Response(new Uint8Array(256), { headers: { "Content-Type": "audio/mpeg" } });

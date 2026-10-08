import { normalizeText } from "./sourceAnalysis.js";

export const LEGAL_SUBJECT_ID = "ade09563-02ec-4a09-a97b-58857f6cd876";
const ordinals = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة"] as const;

export function legalLectureTitle(number: number): string {
  const ordinal = ordinals[number - 1];
  if (!ordinal) throw new Error("invalid_legal_lecture_number");
  return `المحاضرة ${ordinal} قانونية`;
}

/** Strict labels only: Legal10, Illegal1 and unrelated course names stay intact. */
export function legalLectureNumber(value: string): number | null {
  const text = normalizeText(value).replace(/\.pdf$/i, "").trim();
  const english = /^legal[\s_-]*([1-6])$/.exec(text);
  if (english) return Number(english[1]);
  const index = ordinals.findIndex((_, i) => normalizeText(legalLectureTitle(i + 1)) === text);
  return index < 0 ? null : index + 1;
}

/** Presentation labels; never apply this to question prompts or source text. */
export function replaceLegalLabels(value: string): string {
  return value.replace(/(?<![\p{L}\p{N}])legal[\s_-]*([1-6١-٦۱-۶])(?![\p{L}\p{N}])/giu, (_, number: string) => legalLectureTitle(Number(normalizeText(number))));
}

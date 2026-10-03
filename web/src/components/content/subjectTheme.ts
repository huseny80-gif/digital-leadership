export const subjectThemes = ["ai", "legal", "cyber", "innovation", "risk"] as const;
export type SubjectTheme = typeof subjectThemes[number];

export function getSubjectTheme(title: string, index = 0): SubjectTheme {
  const normalized = title.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").toLowerCase();
  if (/ذكاء|بيانات|artificial|data/.test(normalized)) return "ai";
  if (/قانون|تنظيم|تشريع|legal|law/.test(normalized)) return "legal";
  if (/سيبر|حوكم|امن|cyber|security/.test(normalized)) return "cyber";
  if (/ابتكار|مشروع|innovation|project/.test(normalized)) return "innovation";
  if (/مخاطر|risk/.test(normalized)) return "risk";
  return subjectThemes[index % subjectThemes.length];
}

export const subjectArtwork: Record<SubjectTheme, { x: number; y: number; width: number; height: number }> = {
  ai: { x: 211, y: 403, width: 187, height: 50 }, legal: { x: 426, y: 403, width: 180, height: 50 },
  cyber: { x: 634, y: 403, width: 186, height: 50 }, innovation: { x: 848, y: 403, width: 186, height: 50 },
  risk: { x: 1063, y: 403, width: 187, height: 50 },
};

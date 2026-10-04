export interface SubjectCandidate { id: string; title: string; description: string | null }
export interface LectureSection { title: string; number: number | null; text: string }

export function normalizeText(text: string): string {
  return text.normalize("NFKC").replace(/[\u064b-\u065f\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/[ى]/g, "ي")
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0)).toLowerCase().replace(/\s+/g, " ").trim();
}
const vocabulary: Array<[RegExp, string[]]> = [
  [/مخاطر|risk/, ["مخاطر", "risk", "مصفوفة المخاطر", "احتمالية", "معالجة المخاطر", "اتخاذ القرار"]],
  [/سيبر|cyber/, ["سيبراني", "سيبرانية", "cybersecurity", "cyber", "امن المعلومات", "التشفير", "اختراق", "التهديدات", "جدار الحماية"]],
  [/قانون|legal|regulat/, ["قانون", "قانونية", "قوانين", "تشريعات", "التشريع", "الامتثال", "legal", "regulatory", "تنظيمية", "العقود"]],
  [/ابتكار|مشاريع|innovation|project/, ["ابتكار", "الابتكار", "innovation", "project", "المشاريع", "مشروع", "ريادة الاعمال", "التفكير التصميمي", "جدولة"]],
  [/ذكاء|بيانات|artificial|data/, ["الذكاء الاصطناعي", "artificial intelligence", "ai", "تعلم الالة", "machine learning", "البيانات", "data", "الخوارزميات", "الشبكات العصبية"]],
];
const stopWords = new Set(normalizeText("من في على الى عن ان هذا هذه ذلك التي الذي هو هي كما او و مع كل بين لا يتم يمكن يجب كانت كان تكون عند خلال فقط هناك وقد ثم بعد قبل ما هل لقد حيث لكي حتى إن أن أيضًا منصة القيادة الرقمية مادة محاضرة الدراسي الدراسية the and for with that from this is are was were be a an of to by as into").split(" "));
export function significantWords(text: string): string[] {
  return [...new Set(text.normalize("NFKC").match(/[\p{L}][\p{L}\p{M}-]{3,}/gu) ?? [])].filter(word => !stopWords.has(normalizeText(word)));
}
function occurrences(text: string, phrase: string): number {
  const escaped = normalizeText(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = /^[a-z ]+$/.test(escaped) ? `\\b${escaped}\\b` : escaped;
  return Math.min(12, [...text.matchAll(new RegExp(pattern, "g"))].length);
}
export function classifySubject(subjects: SubjectCandidate[], text: string, filename = ""): SubjectCandidate | null {
  const body = normalizeText(text), name = normalizeText(filename.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([a-zA-Z])([0-9])/g, "$1 $2").replace(/[_.-]/g, " "));
  const ranked = subjects.map(subject => {
    const title = normalizeText(subject.title);
    const aliases = vocabulary.find(([pattern]) => pattern.test(title))?.[1] ?? significantWords(subject.title);
    const score = aliases.reduce((total, phrase) => total + occurrences(body, phrase) * (phrase.includes(" ") ? 3 : 1) + occurrences(name, phrase) * 12, 0);
    return { subject, score };
  }).sort((a, b) => b.score - a.score || a.subject.id.localeCompare(b.subject.id));
  return ranked[0]?.score ? ranked[0].subject : null;
}
const ordinals = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"].map(normalizeText);
export function lectureNumber(title: string): number | null {
  const value = normalizeText(title);
  const digits = value.match(/(?:المحاضرة|محاضرة|lecture|week|الاسبوع)\s*(?:رقم\s*)?([0-9]{1,3})/i);
  if (digits) return Number(digits[1]) || null;
  if (!/محاضرة|اسبوع|lecture|week/i.test(value)) return null;
  const ordinal = ordinals.findIndex(word => value.includes(word));
  return ordinal >= 0 ? ordinal + 1 : null;
}
export function splitLectures(text: string, title: string): LectureSection[] {
  const lines = text.normalize("NFKC").split(/\r?\n/);
  const sections: LectureSection[] = [];
  let current: LectureSection = { title, number: lectureNumber(title), text: "" };
  for (const line of lines) {
    const number = lectureNumber(line);
    const isHeading = number !== null && line.trim().length <= 140 && /^(?:\s*\d+[.)-]?\s*)?(?:المحاضرة|محاضرة|Lecture|الأسبوع|الاسبوع|Week)(?:\s|$)/i.test(line.trim());
    if (isHeading && current.number === null && sections.length === 0) {
      current.title = line.trim(); current.number = number;
    } else if (isHeading && current.text.trim().split(/\s+/).length >= 25 && number !== current.number) {
      sections.push(current);
      current = { title: line.trim(), number, text: "" };
    } else if (isHeading && !current.text.trim()) {
      current.title = line.trim(); current.number = number;
    }
    current.text += `${line}\n`;
  }
  if (current.text.trim()) sections.push(current);
  if (sections.length > 30) throw new Error("too_many_lectures");
  return sections;
}

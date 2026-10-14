import { manifest, subjectMapping, type SourceSubject } from "../finquiz/catalog.js";
import { normalizeText } from "./sourceAnalysis.js";
import { cleanArabicDisplayLabel } from "./arabicDisplayLabels.js";

const ordinals = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"];
export const coursePresentationCorrections: Record<string, string> = {
  "إعادة التمحون التلقائي": "إعادة الشحن التلقائي",
  "كمية النص التي يقدر البرنامج يتذكرها بنفس المحادثة.": "كمية النص التي يستطيع البرنامج الاحتفاظ بها ضمن سياق المحادثة نفسها.",
  "محادثة سريعة، أو تنفيذ مهام أكبر باللمّات، أو أداة برمجة كاملة الوظيفة.": "محادثة سريعة، أو تنفيذ مهام أكبر باستخدام الملفات، أو أداة متخصصة في البرمجة.",
  "أسلوب عمل جاهز تُخبِر كلود عند الحاجة تشغيله أو تنشرها بنفسك.": "تعليمات مكتوبة تحدد أسلوب تنفيذ مهمة، ويستعين بها كلود عند الحاجة.",
  "Chat لمهمة سريعة، Projects لموضوع متكرر بذاكرة دائمة، Artifacts لنتيجة تفاعلية مستقلة.": "Chat لمهمة سريعة، وProjects لتنظيم تعليمات وملفات مرجعية لموضوع متكرر، وArtifacts لنتيجة تفاعلية مستقلة.",
  "Artifacts: ناتجة تفاعلية تُنتج نتيجة واحدة تعرض نفسك.": "Artifacts: نواتج تفاعلية مستقلة.",
  "ناتجة تفاعلية تُنتج نتيجة واحدة تعرض نفسك.": "نواتج تفاعلية مستقلة.",
  "إرسال مهمة لفرع مستقل ينفذ عنها بعيدًا ثم تُصوَّر عنك النتيجة.": "إرسال مهمة تُنفَّذ بعيدًا ثم تُعرض عليك نتيجتها.",
};
export function correctCoursePresentation(value: string): string {
  for (const [before, after] of Object.entries(coursePresentationCorrections)) value = value.replaceAll(before, after);
  return value;
}

export interface CourseSourceLabels {
  slug: string;
  subjectId: string;
  source: SourceSubject;
  titleOf: (number: number) => string;
  numberOf: (value: string) => number | null;
  legacyNumber: (value: string) => number | null;
  label: (value: string) => string;
}
const guides = new Map([
  [normalizeText("مقرر الذكاء الاصطناعي1- 4 حلول"), "حلول محاضرات الذكاء الاصطناعي من الأولى إلى الرابعة"],
  [normalizeText("Ai-week1-week2"), "المحاضرتان الأولى والثانية في الذكاء الاصطناعي"],
]);
function makeLabels(slug: string, topic: string): CourseSourceLabels {
  const original = manifest.subjects.find(subject => subject.id === slug)!;
  const titleOf = (number: number) => {
    const ordinal = ordinals[number - 1];
    if (!ordinal) throw new Error("invalid_course_lecture_number");
    return slug === "risk-management" ? `المحاضرة ${ordinal} مخاطر` : slug === "legal-regulatory" ? `المحاضرة ${ordinal} قانونية` : `المحاضرة ${ordinal} في ${topic}`;
  };
  // These reviewed uploads already exist in the deployed AI course. They are
  // matching aliases, not new manifest records or fabricated source files.
  const source = { ...original, lectures: [...original.lectures] };
  if (slug === "ai-data") for (const number of [3, 4]) {
    if (!source.lectures.some(lecture => lecture.number === number)) source.lectures.push({ id: `ai-reviewed-${number}`, number, title: titleOf(number), legacyTitles: [`مقرر الذكاء الاصطناعي${number}`, `Lecture ${number}`] });
  }
  const aliases = new Map(source.lectures.filter(lecture => lecture.id !== "cs-iso-roadmap" && lecture.id !== "ip-l2").flatMap(lecture => [lecture.title, ...(lecture.legacyTitles ?? [])].map(title => [normalizeText(title), lecture.number] as const)));
  const legacyNumber = (value: string) => {
    const text = normalizeText(cleanArabicDisplayLabel(value)).replace(/\.(?:pdf|pptx)$/i, "").trim();
    const expression = slug === "ai-data" ? /^(?:ai|lecture|مقرر\s*الذكاء الاصطناعي|الذكاء الاصطناعي)[\s_-]*([1-9]|10)$/ : slug === "risk-management" ? /^(?:risk(?:\s*management)?)[\s_-]*([1-3])$/ : slug === "legal-regulatory" ? /^legal[\s_-]*([1-6])$/ : slug === "innovation-project-management" ? /^(?:innovation|project(?:\s*management)?)[\s_-]*([1-9]|10)$/ : /^(?:cybersecurity|cyber\s*security|مقرر\s*(?:حوكمة\s*)?الامن السيبراني|(?:حوكمة\s*)?الامن السيبراني)[\s_-]*([1-9]|10)$/;
    const match = expression.exec(text);
    return match ? Number(match[1]) : null;
  };
  const numberOf = (value: string) => {
    const text = normalizeText(cleanArabicDisplayLabel(value)).replace(/\.(?:pdf|pptx)$/i, "").trim();
    const ordinal = ordinals.map((_, index) => normalizeText(titleOf(index + 1))).indexOf(text) + 1;
    // Generic uploads are scoped by the already verified parent folder. The
    // label changes, never the lecture identity, publication state or content.
    const generic = /^(?:lecture|المحاضرة|محاضرة)[\s_-]*(?:رقم\s*)?([1-9]|10)$/u.exec(text);
    const bareOrdinal = /^(?:المحاضرة|محاضرة)[\s_-]+/u.test(text)
      ? ordinals.map(normalizeText).indexOf(text.replace(/^(?:المحاضرة|محاضرة)[\s_-]+/u, "")) + 1 : 0;
    return legacyNumber(text) ?? aliases.get(text) ?? (ordinal || bareOrdinal || (generic ? Number(generic[1]) : null));
  };
  const label = (value: string) => {
    value = cleanArabicDisplayLabel(value);
    const extension = value.match(/\.(pdf|pptx)$/i)?.[0] ?? "";
    const stem = normalizeText(value).replace(/\.(?:pdf|pptx)$/i, "").trim();
    if (slug === "ai-data" && guides.has(stem)) return guides.get(stem)! + extension;
    const combinedCyber = /^(?:(ملخص|اختبار)[:\s]+)?المحاضرة الاولي في حوكمة الامن السيبراني\s*&\s*2$/u.exec(stem);
    if (slug === "cybersecurity-governance" && combinedCyber) return (combinedCyber[1] ? combinedCyber[1] + " المحاضرتين" : "المحاضرتان") + " الأولى والثانية في حوكمة الأمن السيبراني" + extension;
    const number = numberOf(value);
    if (number) return titleOf(number) + extension;
    const pattern = slug === "ai-data"
      ? /(?<![\p{L}\p{N}])(?:Ai|Lecture|مقرر\s*الذكاء الاصطناعي)[\s_-]*([1-9]|10)(?![\p{L}\p{N}]|\s*[-–]\s*\d)/giu
      : slug === "risk-management" ? /(?<![\p{L}\p{N}])Risk(?:\s*Management)?[\s_-]*([1-3])(?![\p{L}\p{N}]|\s*[-–]\s*\d)/giu
      : slug === "legal-regulatory" ? /(?<![\p{L}\p{N}])Legal[\s_-]*([1-6١-٦۱-۶])(?![\p{L}\p{N}]|\s*[-–]\s*\d)/giu
      : slug === "innovation-project-management" ? /(?<![\p{L}\p{N}])(?:Innovation|Project(?:\s*Management)?)[\s_-]*([1-9]|10)(?![\p{L}\p{N}]|\s*[-–]\s*\d)/giu
      : /(?<![\p{L}\p{N}])Cybersecurity[\s_-]*([1-9]|10)(?![\p{L}\p{N}])/giu;
    let result = value.replace(pattern, (_, digit: string) => titleOf(Number(normalizeText(digit))));
    if (slug !== "ai-data") result = result.replace(/(?<![\p{L}\p{N}])Lecture[\s_-]*([1-9]|10)(?![\p{L}\p{N}]|\s*[-–]\s*\d)/giu, (_, digit: string) => titleOf(Number(digit)));
    if (slug === "risk-management") for (const lecture of source.lectures) {
      for (const alias of [lecture.title, ...(lecture.legacyTitles ?? [])]) if (!legacyNumber(alias)) result = result.replaceAll(alias, titleOf(lecture.number));
    }
    return result;
  };
  return { slug, subjectId: subjectMapping[slug]!, source, titleOf, numberOf, legacyNumber, label };
}
export const refreshedCourseLabels = [makeLabels("ai-data", "الذكاء الاصطناعي"), makeLabels("cybersecurity-governance", "حوكمة الأمن السيبراني"), makeLabels("risk-management", "مخاطر")];
// Extending presentation support must not expand the older consolidation job.
export const allCourseLabels = [...refreshedCourseLabels, makeLabels("legal-regulatory", "الثقافة القانونية والتنظيمية"), makeLabels("innovation-project-management", "الابتكار وإدارة المشاريع")];
export function courseLabelsForSubject(subjectId: string) { return allCourseLabels.find(profile => profile.subjectId === subjectId); }
export function courseDisplayLabel(subjectId: string, value: string): string { return courseLabelsForSubject(subjectId)?.label(value) ?? cleanArabicDisplayLabel(value); }

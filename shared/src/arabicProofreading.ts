/** Display corrections only. Source bytes, extracted evidence, reference line
 * numbers, answer keys and trainee submissions must keep their own identities.
 * No model, dictionary completion, lost-number recovery or factual rewriting. */
export const ARABIC_PROOFREADING_POLICY = "academic-arabic-display-v1-2026-10-16";

const words: Readonly<Record<string, string>> = {
  "اأدوات": "أدوات", "اأخرى": "أخرى", "اأيضا": "أيضا",
  "إىل": "إلى", "اىل": "إلى", "عىل": "على", "حىت": "حتى",
  "األوىل": "الأولى", "الأوىل": "الأولى", "األخرى": "الأخرى",
  "اإللكرتوين": "الإلكتروني", "الإلكرتوين": "الإلكتروني",
  "اإللكرتونية": "الإلكترونية", "الإلكرتونية": "الإلكترونية",
  "الرتتيب": "الترتيب", "الرتكيز": "التركيز", "الرتابط": "الترابط",
  "التعريـف": "التعريف", "االسرتاتيجي": "الاستراتيجي", "االسرتاتيجية": "الاستراتيجية",
  "االسرتاتيجيات": "الاستراتيجيات", "االصطناعي": "الاصطناعي",
  "الصالحيات": "الصلاحيات",
  "صالحياتهم": "صلاحياتهم", "صالحياته": "صلاحياته", "صالحيات": "صلاحيات",
  "االتصاالت": "الاتصالات", "االتصال": "الاتصال", "االطالع": "الاطلاع",
  "االستغالل": "الاستغلال", "التالعب": "التلاعب", "اإلعالنات": "الإعلانات",
  "االستقالل": "الاستقلال", "االستدالل": "الاستدلال", "االختالف": "الاختلاف",
  "االستهالك": "الاستهلاك", "اإلبالغ": "الإبلاغ", "اإلحالل": "الإحلال",
  "اإلطالق": "الإطلاق", "اإلتالف": "الإتلاف", "الخالصة": "الخلاصة", "خالصة": "خلاصة",
  "خالل": "خلال", "العمالء": "العملاء", "عمالء": "عملاء", "التفصيالت": "التفصيلات",
  "ألن": "لأن", "ألنها": "لأنها", "ألنه": "لأنه", "إال": "إلا", "أال": "ألا",
  "الاول": "الأول", "الاولى": "الأولى", "ادارة": "إدارة", "الادارة": "الإدارة",
  "الاداري": "الإداري", "الادارية": "الإدارية", "الاجراءات": "الإجراءات",
  "الاشراف": "الإشراف", "الاهداف": "الأهداف", "الاسئلة": "الأسئلة", "اسئلة": "أسئلة",
  "اهمية": "أهمية", "الاهمية": "الأهمية", "الامنية": "الأمنية",
  "الالي": "الآلي", "الالية": "الآلية", "الالكتروني": "الإلكتروني", "الالكترونية": "الإلكترونية",
};

// Only unambiguous broken words actually found in the approved PDF readings.
// A space between arbitrary Arabic words is never removed heuristically.
const fragments: ReadonlyArray<readonly [string, string]> = [
  ["الإلك تروني", "الإلكتروني"], ["الإلك ترونية", "الإلكترونية"],
  ["الإلكتر وني", "الإلكتروني"], ["الإلكتر ونية", "الإلكترونية"],
  ["مست مرة", "مستمرة"], ["استمر ارية", "استمرارية"],
  ["حم اية", "حماية"], ["حما ية", "حماية"], ["تأ ثيرها", "تأثيرها"],
  ["تأ ثير", "تأثير"], ["استعاد تها", "استعادتها"], ["التق نية", "التقنية"],
  ["تق نية", "تقنية"], ["سحابي ة", "سحابية"], ["مف توحة", "مفتوحة"],
  ["للح وادث", "للحوادث"], ["عن د", "عند"], ["ف ي", "في"],
  ["تصري ح", "تصريح"], ["الصلا حيات", "الصلاحيات"],
  ["تح سينات", "تحسينات"], ["استرات يجي", "استراتيجي"],
  ["استرات يجيًا", "استراتيجيًا"], ["الاسترات يجية", "الاستراتيجية"],
  ["الاسترات يجي", "الاستراتيجي"], ["التكنولوج ي", "التكنولوجي"],
  ["الإد ارية", "الإدارية"], ["الإد ارة", "الإدارة"],
  ["اال بتكار", "الابتكار"], ["الا بتكار", "الابتكار"],
  ["الأسوا ق", "الأسواق"], ["الانفتا ح", "الانفتاح"],
  ["تطبي ق", "تطبيق"], ["المز ايا", "المزايا"],
  ["المص الح", "المصالح"], ["تحق يق", "تحقيق"],
  ["السالمة Integrity", "السلامة Integrity"], ["سالمة البيانات", "سلامة البيانات"],
  ["سرية وسالمة", "سرية وسلامة"],
  ["بال منظومة", "بلا منظومة"], ["ال سيارة", "لا سيارة"],
  ["ثالثة عناصر", "ثلاثة عناصر"], ["ثالثة أنواع", "ثلاثة أنواع"],
  ["حوكمة الامن", "حوكمة الأمن"], ["الامن السيبراني", "الأمن السيبراني"], ["امن المعلومات", "أمن المعلومات"],
];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const replacements = fragments.map(([before, after]) => ({
  pattern: new RegExp(`(?<![\\p{L}\\p{M}])([وفبكل]{0,2})${before.split(" ").map(escape).join("[ \\t\\r\\n]+")}(?![\\p{L}\\p{M}])`, "gu"), after,
}));
function correctedWord(token: string): string {
  if (words[token]) return words[token];
  for (const length of [1, 2]) {
    const prefix = token.slice(0, length), rest = token.slice(length);
    if (/^[وفبكل]{1,2}$/u.test(prefix) && words[rest]) return prefix + words[rest];
  }
  return token;
}

export function proofreadArabicText(value: string): string {
  // Leave URLs, email addresses and fenced/inline code byte-for-byte intact.
  return value.split(/(```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/gu).map((part, index) => {
    if (index % 2) return part;
    let text = part.normalize("NFC").replace(/[\u0621-\u064A]+/gu, token => {
      const corrected = correctedWord(token);
      // PDF lam/alef inversions. The hamza is moved, never erased.
      return corrected.replace(/ا([أإآ])ل/gu, "ال$1").replace(/اال(?=[\u0621-\u064A])/gu, "الا");
    });
    // Token corrections can become recognizable after the lam/alef repair.
    text = text.replace(/[\u0621-\u064A]+/gu, correctedWord);
    text = text.replace(/([\u0621-\u064A])[ \t]+([\u064B-\u065F])/gu, "$1$2");
    text = text.replace(/سجال[\u064B\u0651]{2}/gu, "سجلًّا");
    // The isolated PDF glyph sequence «ال» is repaired only before these
    // attested verbs. Never infer negation from an arbitrary incomplete word.
    text = text.replace(/(?<![\p{L}\p{M}])([وف]?)ال(?=\s+(?:يجوز|يمكن|يجب|ينبغي|يهدف|يعني|تعني|يكفي|تكفي|يملك|تملك|توجد|يوجد|تكون|تتحمل|تسمح|تحتاج|نملك|تنتظر|يقرر|يصلح|نحتاج)(?![\p{L}\p{M}]))/gu, "$1لا");
    for (const { pattern, after } of replacements) text = text.replace(pattern, (_match, prefix: string) => prefix + after);
    return text;
  }).join("");
}

/** Changes text nodes only; leaves attributes, addresses, code and markup
 * intact. This is not HTML sanitization: callers retain their existing gate. */
export function proofreadArabicHtml(html: string): string {
  const tokens = html.split(/(<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>)/gu);
  let literal = 0;
  return tokens.map((token, index) => {
    if (index % 2) {
      if (/^<(?:script|style|code|pre)\b/iu.test(token)) literal++;
      else if (/^<\/(?:script|style|code|pre)\b/iu.test(token)) literal = Math.max(0, literal - 1);
      return token;
    }
    return literal ? token : proofreadArabicText(token);
  }).join("");
}

const textFields = new Set([
  "title", "description", "body", "bodyText", "text", "prompt", "explanation", "excerpt", "term", "definition",
  "heading", "label", "introduction", "objectives", "keyPoints", "terms", "criterion", "focus", "expectedGap",
  "discussionQuestion", "rationale", "modelAnswer", "answer", "hint", "feedback", "recommendation", "concept",
  "subjectTitle", "lectureTitle", "topic", "scenario", "paragraphs", "options", "citation", "formatted", "sourceExcerpt",
]);
/** Explicit academic display fields only. Never normalize an entire JSON
 * string: IDs, hashes, paths, URLs, auth data and submitted answers are opaque. */
export function proofreadAcademicContent<T>(value: T, field = ""): T {
  if (typeof value === "string") return (field === "bodyHtml" ? proofreadArabicHtml(value) : textFields.has(field) ? proofreadArabicText(value) : value) as T;
  if (Array.isArray(value)) return value.map(item => proofreadAcademicContent(item, field)) as T;
  if (value && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, proofreadAcademicContent(item, key)])) as T;
  }
  return value;
}

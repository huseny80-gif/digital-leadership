/** Turns one line of summary text into a script for the Saudi narration voices.
 * Display text is never changed: this runs only on the way to the speech
 * provider. Rule based; it never adds a fact that is not in the line. The
 * provider accepts voice and prosody only, so pauses come from punctuation. */
export const SAUDI_SCRIPT_MAX_WORDS = 12;
const COMMA_BREAK_AFTER = 5;
const WORD_BREAK_AFTER = 7;

const ones = ["صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const hundreds = ["", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(hundreds[Math.floor(n / 100)]!);
  const rest = n % 100;
  if (rest > 0) {
    if (rest < 20) parts.push(ones[rest]!);
    else parts.push(rest % 10 ? `${ones[rest % 10]} و${tens[Math.floor(rest / 10)]}` : tens[Math.floor(rest / 10)]!);
  }
  return parts.join(" و");
}

export function arabicCardinal(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 999_999_999) throw new RangeError("unsupported number");
  if (value === 0) return ones[0]!;
  const groups: Array<[number, string, string, string]> = [[1_000_000, "مليون", "مليونان", "ملايين"], [1_000, "ألف", "ألفان", "آلاف"]];
  const parts: string[] = [];
  let rest = value;
  for (const [size, one, two, many] of groups) {
    const count = Math.floor(rest / size);
    rest %= size;
    if (!count) continue;
    if (count === 1) parts.push(one);
    else if (count === 2) parts.push(two);
    else if (count <= 10) parts.push(`${below1000(count)} ${many}`);
    else parts.push(`${below1000(count)} ${one}`);
  }
  if (rest) parts.push(below1000(rest));
  return parts.join(" و");
}

const letters: Record<string, string> = {
  A: "إي", B: "بي", C: "سي", D: "دي", E: "إي", F: "إف", G: "جي", H: "إتش", I: "آي", J: "جي", K: "كي", L: "إل", M: "إم",
  N: "إن", O: "أو", P: "بي", Q: "كيو", R: "آر", S: "إس", T: "تي", U: "يو", V: "في", W: "دبليو", X: "إكس", Y: "واي", Z: "زد",
};
const latinWords: Record<string, string> = {
  Cybersecurity: "الأمن السيبراني", cybersecurity: "الأمن السيبراني", ISO: "آيزو", Agile: "أجايل", Scrum: "سكرم", Kanban: "كانبان", Kaizen: "كايزن", Waterfall: "واتر فول",
  Lean: "لين", Sprint: "سبرنت", Sprints: "سبرنتس", Jira: "جيرا", Trello: "تريلو", Claude: "كلود", Anthropic: "أنثروبيك", Google: "جوجل", Gmail: "جيميل", Excel: "إكسل",
  Word: "وورد", PowerPoint: "باوربوينت", Linux: "لينكس", Siri: "سيري", Alexa: "أليكسا", Zapier: "زابيير", Web3: "ويب ثري", Metaverse: "ميتافيرس",
  Management: "مانجمنت", Innovation: "إينوفيشن", Governance: "جفرننس", Risk: "ريسك", Digital: "ديجيتال", Leadership: "ليدرشب", Apps: "آبس", Roadmap: "رود ماب",
};

// Function words only, so no academic term or claim changes.
const dialect: Array<[RegExp, string]> = [
  [/(?<![\p{L}\p{M}])لماذا(?![\p{L}\p{M}])/gu, "ليش"],
  [/(?<![\p{L}\p{M}])ماذا(?![\p{L}\p{M}])/gu, "وش"],
  [/(?<![\p{L}\p{M}])لذلك(?![\p{L}\p{M}])/gu, "عشان كذا"],
  [/(?<![\p{L}\p{M}])الآن(?![\p{L}\p{M}])/gu, "الحين"],
  [/(?<![\p{L}\p{M}])لأن(?![\p{L}\p{M}])/gu, "عشان"],
];
const splitBefore = new Set(["لكن", "حيث", "ثم", "بينما", "كما", "إذ", "بل", "لكنه", "لكنها", "الذي", "التي", "الذين", "بحيث", "وهو", "وهي", "وقد", "وكذلك", "وذلك",
  "ولذلك", "عشان", "أما", "فإن", "فهو", "فهي", "وإن", "أو", "ومن", "وفي", "وعلى", "وإلى", "وهذا", "وهذه", "ويمكن", "ويجب", "وعند", "وبذلك", "وبالتالي", "ولا", "ومع"]);
export interface SaudiScriptStats { numbers: number; latin: number; splits: number; overlong: number; dialect: number; dropped: number }

const digitMap: Record<string, string> = Object.fromEntries([..."٠١٢٣٤٥٦٧٨٩"].map((d, i) => [d, String(i)]).concat([..."۰۱۲۳۴۵۶۷۸۹"].map((d, i) => [d, String(i)])));
const asciiDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, digit => digitMap[digit]!);

function numbersToWords(text: string, stats: SaudiScriptStats): string {
  return asciiDigits(text).replace(/(?<![A-Za-z\d.])(\d{1,9})(?:[.,٫](\d{1,4}))?(\s*%)?(?![A-Za-z\d])/gu, (match, whole: string, fraction: string | undefined, percent: string | undefined, offset: number, source: string) => {
    stats.numbers++;
    const spoken = arabicCardinal(Number(whole)) + (fraction ? ` فاصلة ${[...fraction].map(d => arabicCardinal(Number(d))).join(" ")}` : "") + (percent ? " بالمئة" : "");
    const before = source[offset - 1] ?? "";
    // A prefixed conjunction (و، ب، ل، ك، ف) attaches to the spoken number; any other letter is a label.
    return /[\p{L}]/u.test(before) && !/[وبلكف]/u.test(before) ? ` ${spoken}` : spoken;
  }).replace(/٪/g, " بالمئة").replace(/\s*×\s*/g, " ضرب ");
}

function spell(letterRun: string): string { return [...letterRun].map(letter => letters[letter]).join("-"); }

function latinToArabic(text: string, stats: SaudiScriptStats): string {
  let result = text.replace(/\b([A-Z]{2,})(\d{1,4})\b/g, (_m, run: string, digits: string) => { stats.latin++; return `${spell(run)} ${/^0/.test(digits) ? [...digits].map(d => arabicCardinal(Number(d))).join(" ") : arabicCardinal(Number(digits))}`; });
  result = result.replace(/\b[A-Za-z][A-Za-z0-9]*s?\b/g, word => {
    if (latinWords[word]) { stats.latin++; return latinWords[word]!; }
    const plural = /^[A-Z]{2,}s$/.test(word);
    const base = plural ? word.slice(0, -1) : word;
    if (!/^[A-Z]{2,}$/.test(base)) return word;
    stats.latin++;
    return spell(base) + (plural ? "-ز" : "");
  });
  // An English gloss in parentheses repeats the Arabic term before it; drop it from the audio only.
  return result.replace(/\s*\((?=[^()]*[A-Za-z])[^()\u0600-\u06FF]{1,60}\)/g, () => { stats.dropped++; return ""; });
}

function splitLongSentence(sentence: string, stats: SaudiScriptStats): string {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= SAUDI_SCRIPT_MAX_WORDS) return sentence;
  const out: string[] = []; let since = 0;
  words.forEach((word, index) => {
    out.push(word); since++;
    const remaining = words.length - index - 1;
    if (/:$/u.test(word)) { since = 0; return; }
    if (remaining < 3) return;
    if (/[،,]$/u.test(word) && since >= COMMA_BREAK_AFTER) { out[out.length - 1] = word.replace(/[،,]$/u, "."); since = 0; stats.splits++; }
    else if (since >= WORD_BREAK_AFTER && splitBefore.has(words[index + 1]!)) { out[out.length - 1] = `${word}.`; since = 0; stats.splits++; }
  });
  return out.join(" ");
}

export function saudiVoiceScript(line: string): { text: string; stats: SaudiScriptStats } {
  const stats: SaudiScriptStats = { numbers: 0, latin: 0, splits: 0, overlong: 0, dialect: 0, dropped: 0 };
  let text = latinToArabic(numbersToWords(line, stats), stats);
  for (const [pattern, replacement] of dialect) text = text.replace(pattern, () => { stats.dialect++; return replacement; });
  text = text.split(/(?<=[.!?؟؛])\s+/u).map(sentence => splitLongSentence(sentence, stats)).join(" ");
  for (const sentence of text.split(/(?<=[.!?؟؛])\s+/u)) if (sentence.split(/\s+/).filter(Boolean).length > SAUDI_SCRIPT_MAX_WORDS) stats.overlong++;
  return { text: text.replace(/\s+/g, " ").trim(), stats };
}

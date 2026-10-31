import { createHash } from "node:crypto";
import { log } from "node:console";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { STUDY_COURSES } from "../../shared/dist/index.js";
import { manifest, catalogRoot } from "../dist/finquiz/catalog.js";
import { readAsset } from "../dist/finquiz/assetFiles.js";
import { academicSummaryFor } from "../dist/finquiz/academicSummaries.js";
import { actualFileText, scopeSharedSource } from "../dist/examMaterials/lectureSourceFiles.js";
import { sourceParagraphs, groundedQuestionCandidates, validGroundedQuestion } from "../dist/examMaterials/sourceGrounding.js";
import { legacyQuestionCandidates } from "../dist/examMaterials/diverseAssessment.js";
import { courseQuestionProgramKey } from "../dist/examMaterials/reviewedCourseQuestionWording.js";
import { WeeklyCyberExams, weeklyCyberSubjectId } from "../dist/examMaterials/weeklyCyberExams.js";

const args = process.argv.slice(2), check = args.includes("--check"), directoryIndex = args.indexOf("--output-dir");
if (args.some((arg, index) => arg !== "--check" && arg !== "--output-dir" && index !== directoryIndex + 1)) throw new Error("invalid_export_arguments");
if (directoryIndex < 0 || !args[directoryIndex + 1]) throw new Error("output_directory_required");
const out = resolve(args[directoryIndex + 1]);
const content = new URL("../content/finquiz/", import.meta.url);
const data = JSON.parse(await readFile(new URL("courseQuestionEditorial.json", content), "utf8"));
const cached = JSON.parse(await readFile(new URL("extractedSources.json", content), "utf8")).sources;
const hash = text => createHash("sha256").update(text).digest("hex");
const escape = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const formats = { multiple_choice: "اختيار من متعدد", true_false: "صح / خطأ", match: "مطابقة", order: "ترتيب", essay: "مقالي", short_scenario: "سيناريو قصير", case_study: "حالة دراسية مستقلة" };
const levels = { easy: "سهل", medium: "متوسط", hard: "صعب", very_hard: "صعب جدًا" };
const bloom = { remember: "التذكر", understand: "الفهم", apply: "التطبيق", analyze: "التحليل", evaluate: "التقييم", create: "الإبداع" };
const letter = index => "أبجد"[index] ?? String(index + 1);
const count = values => values.reduce((totals, value) => ({ ...totals, [value]: (totals[value] ?? 0) + 1 }), {});
const revisions = [];
let grandTotal = 0;
async function save(name, body) {
  const path = resolve(out, name);
  if (check) { if (await readFile(path, "utf8") !== body) throw new Error(`export_stale:${name}`); }
  else await writeFile(path, body);
}
if (!check) await mkdir(out, { recursive: true });
for (const course of STUDY_COURSES.filter(course => course.slug !== "innovation-project-management")) {
  const subject = manifest.subjects.find(subject => subject.id === course.slug);
  const approved = data.courses.find(item => item.slug === course.slug);
  const rows = [...subject.lectures];
  if (course.slug === "cybersecurity-governance") rows.push({ id: "cs-l6", number: 6, title: "المحاضرة السادسة في حوكمة الأمن السيبراني — إدارة المخاطر السيبرانية" });
  rows.sort((a, b) => a.number - b.number);
  const lines = [`# الأسئلة المنقّحة — ${subject.title}`, "", "الصياغات التالية مرتبطة بمصادر المحاضرات. بقيت أنواع الأسئلة وصعوبتها والخيارات والمفاتيح كما هي. استُكملت مواضع محددة في نماذج الإجابات المفتوحة من المصدر نفسه، مع بقاء عدد عناصر النموذج ودرجاته والمهمة الأصلية.", "", "تصنيف بلوم أدناه مراجعة تحريرية مستنتجة من المهمة الأصلية للأسئلة التي لم تحمل وسمًا معرفيًا محفوظًا؛ ولا يمثل قياسًا سيكومتريًا تجريبيًا.", ""];
  let number = 0;
  const formatValues = [], difficultyValues = [];
  for (const row of rows) {
    const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && academicSummaryFor(asset.sha256)?.lectureId === row.id);
    let document, lineOffset = 0;
    if (asset) {
      const result = await actualFileText(await readAsset(asset, catalogRoot), asset.filename, "application/pdf");
      const scoped = scopeSharedSource({ id: asset.id, filename: asset.filename, ...result }, { title: row.title, orderIndex: row.number }, false);
      document = scoped.document; lineOffset = scoped.lineOffset;
    } else {
      const transcript = cached.find(item => academicSummaryFor(item.sha256)?.lectureId === row.id);
      if (!transcript || hash(transcript.text) !== transcript.textSha256) throw new Error("cached_source_invalid");
      document = { id: "reviewed-private-cyber-risk-transcript", filename: "إدارة المخاطر السيبرانية.pdf", sha256: transcript.sha256, text: transcript.text };
      lines.push("> مصدر هذه المحاضرة هو التفريغ المعتمد المحفوظ والمقيد ببصمة الملف؛ لم يُفحص الملف الخاص الحالي مباشرةً في عملية التصدير.", "");
    }
    const paragraphs = sourceParagraphs(document, lineOffset), originals = legacyQuestionCandidates(paragraphs), current = groundedQuestionCandidates(paragraphs);
    if (current.length !== originals.length) throw new Error("export_question_count_changed");
    lines.push(`## المحاضرة ${row.number}: ${escape(row.title)}`, "");
    for (const [index, question] of current.entries()) {
      if (!validGroundedQuestion(question, paragraphs)) throw new Error("export_unverified_question");
      const entry = approved.edits.find(edit => edit.key === courseQuestionProgramKey(originals[index]));
      if (!entry || entry.prompt !== question.prompt) throw new Error("export_unapproved_wording");
      const format = question.type === "open" ? question.kind : question.type;
      number++; formatValues.push(format); difficultyValues.push(question.difficulty);
      lines.push(`### السؤال ${number}`, "", `- **الصيغة:** ${formats[format]}`, `- **الصعوبة:** ${levels[question.difficulty]}`, `- **المستوى المعرفي (تحريري):** ${bloom[entry.cognitiveReview.level]}`, "", "**نص السؤال:**", "", escape(question.prompt), "");
      if (question.options) lines.push("**الخيارات:**", "", ...question.options.map((option, index) => `${letter(index)}) ${escape(option)}  `), "", `**الإجابة الصحيحة:** ${letter(question.correctIndex)} — ${escape(question.options[question.correctIndex])}`, "");
      if (question.pairs) lines.push("**نموذج المطابقة الصحيحة:**", "", "| العنصر | المقابل الصحيح |", "|---|---|", ...question.pairs.map(pair => `| ${escape(pair.left).replaceAll("|", "\\|")} | ${escape(pair.right).replaceAll("|", "\\|")} |`), "");
      if (question.items) lines.push("**الترتيب الصحيح:**", "", ...question.items.map((item, index) => `${index + 1}. ${escape(item)}`), "");
      if (question.rubric) lines.push("**نموذج الإجابة:**", "", ...question.rubric.map((point, index) => `${index + 1}. ${escape(point.text)}`), "");
      lines.push("**التبرير والتوثيق:**", "", escape(question.explanation), "");
      if (entry.sourceClarification) lines.push(`> ملاحظة تدقيق: ${escape(entry.sourceClarification)}`, "");
    }
  }
  let weeklyCount = 0;
  if (course.id === weeklyCyberSubjectId) {
    const service = new WeeklyCyberExams(), collection = service.index(course.id);
    lines.push("## اختبارات د. ضياء الأسبوعية — حسب الأسابيع", "", `> ${escape(collection.solutionNote)}`, "");
    for (const paper of service.index(course.id).papers) {
      lines.push(`### ${escape(paper.title)}`, "");
      const questions = service.paper(course.id, paper.id).questions, answers = service.solutions(course.id, paper.id);
      for (const [index, question] of questions.entries()) {
        const answer = answers[index], key = `weekly:${paper.id}:${question.id}`, edit = data.weekly.find(edit => edit.key === key);
        if (!edit || edit.prompt !== question.prompt) throw new Error("export_weekly_wording_mismatch");
        weeklyCount++; formatValues.push(question.type); difficultyValues.push(question.difficulty);
        lines.push(`#### السؤال ${question.number}`, "", `- **الصيغة:** ${formats[question.type]}`, `- **الصعوبة:** ${levels[question.difficulty]}`, `- **المستوى المعرفي (تحريري):** ${bloom[edit.cognitiveReview.level]}`, `- **الدرجات:** ${question.points}${question.proposedPoints ? " (مقترحة للتصحيح اليدوي)" : ""}`, "", "**نص السؤال:**", "", escape(question.prompt), "");
        if (question.options.length) lines.push("**الخيارات:**", "", ...question.options.map((option, index) => `${letter(index)}) ${escape(option)}  `), "", `**الإجابة الصحيحة:** ${letter(answer.correctIndex)} — ${escape(answer.modelAnswer)}`, "");
        else lines.push("**نموذج الإجابة — تصحيح يدوي:**", "", ...(Array.isArray(answer.modelAnswer) ? answer.modelAnswer : [answer.modelAnswer]).map((section, index) => typeof section === "string"
          ? `${index + 1}. ${escape(section)}` : `${index + 1}. **${escape(section.heading)}**: ${escape(section.text)}`), "");
        if (answer.rubric) lines.push("**معايير التصحيح:**", "", ...answer.rubric.map(item => `- ${escape(item.criterion)} — ${item.points} درجات.`), "");
        if (answer.answerReferences?.length) lines.push("**مراجع الإجابة:**", "", ...answer.answerReferences.map(reference => `- ${escape(reference.filename)}${reference.page ? ` — صفحة ${reference.page}` : ""}${reference.topic ? ` — ${escape(reference.topic)}` : ""}`), "");
        lines.push("**التبرير:**", "", escape(answer.rationale), "", `**المصدر:** ${escape(question.questionReference.filename)} — صفحة ملف PDF: ${question.questionReference.page}`, "");
      }
    }
  }
  const name = `${course.slug}.md`, body = lines.join("\n");
  await save(name, body);
  const result = { subject: course.slug, curriculum: number, weekly: weeklyCount, total: number + weeklyCount, formats: count(formatValues), difficulties: count(difficultyValues), sha256: hash(body), file: name };
  revisions.push(result); grandTotal += result.total;
  log(JSON.stringify(result));
}
await save("manifest.json", JSON.stringify({ policy: data.version, excludedSubject: "innovation-project-management", total: grandTotal, reports: revisions }, null, 2) + "\n");
log(`${check ? "Verified" : "Exported"} ${grandTotal} approved questions with answer keys and source rationale.`);

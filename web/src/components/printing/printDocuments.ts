import type { ExamMaterialSummary, LibraryEntry, QuestionForAttempt, StudyPrintBlock, StudyPrintDocument } from "@shared/index";
import { examSummaryPresentation, libraryEntriesPresentation, uniqueStudyText } from "@digital-leadership/shared";

const letters = ["أ", "ب", "ج", "د", "هـ", "و"];
const questionTypes = { multiple_choice: "اختيار من متعدد", true_false: "صح أو خطأ", fill: "إكمال", match: "مطابقة", order: "ترتيب", open: "سؤال مقالي أو سيناريو", short_answer: "إجابة قصيرة" };
function add(blocks: StudyPrintBlock[], text: string, heading = false) {
  let remaining = text.trim();
  // Keep long chapters within the transport schema without dropping their tail.
  while (remaining.length) {
    let end = Math.min(15000, remaining.length);
    if (end < remaining.length) { const boundary = remaining.lastIndexOf(" ", end); if (boundary > end / 2) end = boundary; }
    const part = remaining.slice(0, end).trim();
    if (part) blocks.push({ text: part, ...(heading ? { heading: true } : {}) });
    remaining = remaining.slice(end).trim();
  }
}

/** All questions in the active filters, not only the runner's current question.
 * Explicit public fields exclude answers, feedback, rubrics and internal IDs. */
export function questionPrintDocument(title: string, questions: QuestionForAttempt[]): StudyPrintDocument {
  const blocks: StudyPrintBlock[] = [];
  questions.forEach((question, index) => {
    add(blocks, `السؤال ${index + 1} — ${questionTypes[question.questionType]}`, true);
    if (question.lectureTitle) add(blocks, question.lectureTitle);
    add(blocks, question.prompt);
    question.options?.forEach((option, optionIndex) => add(blocks, `${letters[optionIndex] ?? optionIndex + 1}) ${option.optionText}`));
    if (question.matchItems) {
      add(blocks, "صل عناصر القائمة الأولى بما يقابلها في القائمة الثانية.");
      add(blocks, "القائمة الأولى", true);
      question.matchItems.left.forEach((item, itemIndex) => add(blocks, `${itemIndex + 1}) ${item.text}`));
      add(blocks, "القائمة الثانية", true);
      question.matchItems.right.forEach((item, itemIndex) => add(blocks, `${letters[itemIndex] ?? itemIndex + 1}) ${item.text}`));
    }
    if (question.orderItems) {
      add(blocks, "رتّب العناصر بالترتيب الصحيح.");
      question.orderItems.forEach((item, itemIndex) => add(blocks, `${itemIndex + 1}) ${item.text}`));
    }
    if (!question.options) add(blocks, "الإجابة: __________________________________________________");
  });
  return { kind: "questions", title, subtitle: `منصة القيادة الرقمية · الأسئلة التدريبية · ${questions.length} سؤالًا`, blocks };
}

export function examSummaryPrintDocument(summary: ExamMaterialSummary): StudyPrintDocument {
  const blocks: StudyPrintBlock[] = [];
  add(blocks, summary.introduction);
  examSummaryPresentation(summary).sections.forEach(section => {
    add(blocks, `المحاضرة ${section.number} — ${section.title}`, true);
    if (section.objectives?.length) { add(blocks, "أهداف المحاضرة", true); section.objectives.forEach(text => add(blocks, `• ${text}`)); }
    if (section.topics?.length) section.topics.forEach(topic => {
      add(blocks, topic.title, true); add(blocks, topic.text);
      if (topic.details) { add(blocks, "تفاصيل المحور وتطبيقاته", true); add(blocks, topic.details); }
    });
    else add(blocks, section.text);
    if (section.concepts?.length) { add(blocks, "المفاهيم والمصطلحات الأساسية", true); section.concepts.forEach(concept => add(blocks, `${concept.term}: ${concept.definition}`)); }
    if (section.keyPoints.length) { add(blocks, "نقاط أساسية للمراجعة", true); section.keyPoints.forEach(text => add(blocks, `• ${text}`)); }
  });
  return { kind: "summary", title: "الملخص الشامل للمحاضرات المختارة", subtitle: "منصة القيادة الرقمية · المادة الامتحانية", blocks };
}

/** Called on click in the browser; HTML stays inert and is converted to text.
 * Includes folded document content, lists and table rows, without reader controls. */
export function htmlPrintBlocks(html: string): StudyPrintBlock[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script,style,iframe,button,input,select,textarea,nav,[hidden],[data-print-ignore]").forEach(element => element.remove());
  const blocks: StudyPrintBlock[] = [];
  const text = (element: Element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  function visit(element: Element) {
    if (element.tagName === "TABLE") {
      element.querySelectorAll("tr").forEach(row => add(blocks, Array.from(row.children).map(text).join(" | "), Boolean(row.querySelector("th"))));
    } else if (/^H[1-6]$/.test(element.tagName)) add(blocks, text(element), true);
    else if (["P", "LI", "DT", "DD", "PRE", "BLOCKQUOTE", "SUMMARY"].includes(element.tagName)) {
      const copy = element.cloneNode(true) as Element;
      copy.querySelectorAll("ul,ol,table,p,pre,blockquote").forEach(child => child.remove());
      copy.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
      const value = copy.textContent?.trim() ?? "";
      const prefix = element.tagName === "LI" ? element.parentElement?.tagName === "OL" ? `${Array.from(element.parentElement.children).indexOf(element) + 1}) ` : "• " : "";
      add(blocks, prefix + value, ["DT", "SUMMARY"].includes(element.tagName));
      Array.from(element.children).filter(child => ["UL", "OL", "TABLE", "P", "PRE", "BLOCKQUOTE"].includes(child.tagName)).forEach(visit);
    } else if (element.children.length) {
      let inline = "";
      const flush = () => { add(blocks, inline); inline = ""; };
      Array.from(element.childNodes).forEach(node => { if (node.nodeType === 3) inline += node.textContent; else if (node.nodeType === 1) { flush(); visit(node as Element); } }); flush();
    } else add(blocks, text(element));
  }
  visit(document.body); return blocks;
}

export function librarySummaryPrintDocument(title: string, entries: LibraryEntry[], items: Array<{ title: string; text: string }> = []): StudyPrintDocument | null {
  const blocks: StudyPrintBlock[] = [];
  libraryEntriesPresentation(entries).forEach(entry => {
    add(blocks, entry.title, true);
    if (entry.description) add(blocks, entry.description);
    if (entry.objectives?.length) { add(blocks, "أهداف المحاضرة", true); entry.objectives.forEach(text => add(blocks, `• ${text}`)); }
    if (entry.keyPoints?.length) { add(blocks, "النقاط الرئيسية", true); entry.keyPoints.forEach(text => add(blocks, `• ${text}`)); }
    if (entry.concepts?.length) { add(blocks, "المفاهيم", true); entry.concepts.forEach(concept => add(blocks, `${concept.term}: ${concept.definition}`)); }
    if (entry.terms?.length) add(blocks, entry.terms.join(" · "));
    if (entry.note) add(blocks, entry.note);
    entry.files.filter(file => file.bodyHtml && !file.inlineReferenceId).forEach(file => { add(blocks, file.label, true); blocks.push(...htmlPrintBlocks(file.bodyHtml!)); });
  });
  items.forEach(item => { const text = uniqueStudyText(item.text, blocks.filter(block => !block.heading).map(block => block.text)); if (text) { add(blocks, item.title, true); add(blocks, text); } });
  return blocks.some(block => !block.heading) ? { kind: "summary", title, subtitle: "منصة القيادة الرقمية · الملخصات الدراسية", blocks } : null;
}

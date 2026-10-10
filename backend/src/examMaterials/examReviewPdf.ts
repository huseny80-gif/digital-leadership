import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import type { ExamMaterialDetail, ExamMindMapNode, QuestionForAttempt } from "@shared/index";
import { examSummaryPresentation, generateExamReviewArtifacts } from "@digital-leadership/shared";
import { visualRuns } from "../studyTools/reportExport.js";

const font = (weight: string) => fileURLToPath(new URL(`../../content/report-fonts/Amiri-${weight}.ttf`, import.meta.url));
const labels = { multiple_choice: "اختيار من متعدد", true_false: "صح أو خطأ", fill: "إكمال", match: "مطابقة", order: "ترتيب", open: "سؤال مقالي", short_answer: "إجابة قصيرة" };

/** Server-authorized archive snapshot, public questions only. The exported
 * graph is vector artwork, not a screenshot or a hidden answer-key payload. */
export async function examReviewPdf(group: ExamMaterialDetail, questions: QuestionForAttempt[]): Promise<Buffer> {
  const logo = fileURLToPath(new URL("../../content/report-fonts/platform-logo.png", import.meta.url));
  const review = group.review ?? generateExamReviewArtifacts(group.summary, group.title);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true, info: { Title: `حزمة المراجعة — ${group.title}`, Author: "منصة القيادة الرقمية", Subject: "الملخص الشامل وخريطة المفاهيم والأسئلة التدريبية" } });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk)); doc.on("error", reject); doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont("Arabic", font("Regular")); doc.registerFont("ArabicBold", font("Bold"));
    const features: NonNullable<PDFKit.Mixins.TextOptions["features"]> = [];
    const left = 56, right = doc.page.width - 56, width = right - left;
    let y = 110;
    const measure = (text: string) => doc.widthOfString(text, { features });
    function lines(text: string, available: number): string[] {
      const result: string[] = [];
      for (const paragraph of text.split(/\n+/).filter(Boolean)) {
        let line = "";
        for (const word of paragraph.split(/\s+/)) {
          if (line && measure(`${line} ${word}`) > available) { result.push(line); line = ""; }
          // Long uninterrupted terms are wrapped without silently clipping.
          let part = "";
          for (const char of word) {
            if (part && measure(part + char) > available) { if (line) { result.push(line); line = ""; } result.push(part); part = ""; }
            part += char;
          }
          line += `${line ? " " : ""}${part}`;
        }
        if (line) result.push(line);
      }
      return result;
    }
    function rtlLine(text: string, x: number, at: number, available: number) {
      // Isolate numeric ranges, dates and page fractions inside Arabic text.
      // Remove formatting controls only after bidi ordering; they have no glyph.
      const isolated = text.replace(/[0-9٠-٩]+(?:\s*[/:\-–]\s*[0-9٠-٩]+)+/g, value => `\u2066${value}\u2069`);
      const runs = visualRuns(isolated).map(run => run.replace(/[\u2066-\u2069]/g, "")).filter(Boolean);
      let start = x + available - runs.reduce((sum, run) => sum + measure(run), 0);
      for (const run of runs) { doc.text(run, start, at, { lineBreak: false, features }); start += measure(run); }
    }
    function newPage() { doc.addPage(); y = 108; }
    function write(text: string, heading = false) {
      const size = heading ? 14 : 12;
      doc.font(heading ? "ArabicBold" : "Arabic").fontSize(size).fillColor(heading ? "#07566a" : "#172b3a");
      for (const line of lines(text, width)) { if (y + size * 2 > doc.page.height - 70) { newPage(); } rtlLine(line, left, y, width); y += size * 2; }
      y += heading ? 10 : 12;
    }
    function node(node: ExamMindMapNode, x: number, at: number, index?: number) {
      doc.roundedRect(x, at, 216, 66, 9).fillAndStroke(node.kind === "lecture" ? "#e5f4f5" : "#f2f6fa", "#bad7de");
      doc.font("ArabicBold").fontSize(11).fillColor("#143f50");
      const title = `${index === undefined ? "" : `${index + 1}. `}${node.label}`;
      const wrapped = lines(title, 190);
      wrapped.slice(0, 2).forEach((line, lineIndex) => rtlLine(lineIndex === 1 && wrapped.length > 2 ? `${line.slice(0, -2)}…` : line, x + 13, at + 9 + lineIndex * 20, 190));
    }
    write("حزمة المراجعة الذكية", true); write(group.title, true);
    write(`المادة الامتحانية · المراجعة ${group.sequence} · ${group.lectures.length} محاضرة · ${questions.length} سؤالًا`);
    write(`تاريخ إعداد المجموعة: ${new Date(group.createdAt).toLocaleDateString("ar", { timeZone: "UTC" })}`);
    write("محتويات الحزمة", true);
    write("١. الملخص الأكاديمي الشامل\n٢. خرائط المفاهيم البصرية وروابط المصطلحات المشتركة\n٣. الأسئلة التدريبية ومساحة للإجابة");
    write("المحاضرات المختارة", true); group.lectures.forEach(lecture => write(`${lecture.number}. ${lecture.title}`));
    newPage(); write("١. الملخص الأكاديمي الشامل", true); write(group.summary.introduction);
    for (const section of examSummaryPresentation(group.summary).sections) {
      write(`المحاضرة ${section.number} — ${section.title}`, true);
      if (section.objectives?.length) { write("أهداف المحاضرة", true); section.objectives.forEach(objective => write(`• ${objective}`)); }
      if (section.topics?.length) for (const topic of section.topics) { write(topic.title, true); write(topic.text); if (topic.details) write(topic.details); }
      else write(section.text);
      if (section.concepts?.length) { write("المفاهيم والمصطلحات الأساسية", true); section.concepts.forEach(concept => write(`${concept.term}: ${concept.definition}`)); }
      if (section.keyPoints.length) { write("نقاط أساسية للمراجعة", true); section.keyPoints.forEach(point => write(`• ${point}`)); }
    }
    for (const lecture of review.mindMap.nodes.filter(item => item.kind === "lecture")) {
      const children = review.mindMap.nodes.filter(item => item.parentId === lecture.id);
      for (let offset = 0; offset < Math.max(1, children.length); offset += 10) {
        newPage(); write("٢. خريطة المفاهيم", true); write(lecture.label, true);
        const top = y + 4; node(lecture, (doc.page.width - 216) / 2, top);
        const items = children.slice(offset, offset + 10);
        items.forEach((item, index) => {
          const row = Math.floor(index / 2), x = index % 2 ? left : right - 216, at = top + 106 + row * 84;
          doc.moveTo(doc.page.width / 2, top + 66).lineTo(doc.page.width / 2, at + 32).lineTo(index % 2 ? x + 216 : x, at + 32).lineWidth(1).strokeColor("#6ca8b7").stroke();
          node(item, x, at, offset + index);
        });
        y = top + 112 + Math.ceil(items.length / 2) * 84;
        write("تربط الخطوط المحاضرة بمحاورها ومفاهيمها. الشرح التفصيلي وارد في الملخص.");
      }
    }
    const shared = review.mindMap.edges.filter(edge => edge.kind === "shared");
    if (shared.length) {
      newPage(); write("المصطلحات المشتركة بين المحاضرات", true);
      for (const edge of shared) {
        const first = review.mindMap.nodes.find(node => node.id === edge.from)!, second = review.mindMap.nodes.find(node => node.id === edge.to)!;
        const firstLecture = group.lectures.find(lecture => lecture.id === first.lectureId)!, secondLecture = group.lectures.find(lecture => lecture.id === second.lectureId)!;
        write(`${first.label}: ورود مشترك في المحاضرة ${firstLecture.number} والمحاضرة ${secondLecture.number}`);
      }
    }
    newPage(); write("٣. الأسئلة التدريبية", true);
    questions.forEach((question, index) => {
      write(`السؤال ${index + 1} — ${labels[question.questionType]}`, true);
      if (question.lectureTitle) write(question.lectureTitle); write(question.prompt);
      question.options?.forEach((option, optionIndex) => write(`${"أبجدهو"[optionIndex] ?? optionIndex + 1}) ${option.optionText}`));
      if (question.matchItems) {
        write("صل عناصر القائمة الأولى بما يقابلها في القائمة الثانية."); write("القائمة الأولى", true);
        question.matchItems.left.forEach((item, itemIndex) => write(`${itemIndex + 1}) ${item.text}`)); write("القائمة الثانية", true);
        question.matchItems.right.forEach((item, itemIndex) => write(`${itemIndex + 1}) ${item.text}`));
      }
      if (question.orderItems) { write("رتّب العناصر بالترتيب الصحيح."); question.orderItems.forEach((item, itemIndex) => write(`${itemIndex + 1}) ${item.text}`)); }
      write("الإجابة: __________________________________________________");
    });
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      doc.switchToPage(index);
      doc.image(logo, left, 24, { fit: [154, 48] });
      doc.font("ArabicBold").fontSize(12).fillColor("#07566a"); rtlLine("منصة القيادة الرقمية", right - 210, 32, 210);
      doc.moveTo(left, 88).lineTo(right, 88).lineWidth(1).strokeColor("#c7dfe4").stroke();
      doc.font("Arabic").fontSize(10).fillColor("#47616c"); rtlLine(`المادة الامتحانية · ${index + 1} / ${pages.count}`, left, doc.page.height - 45, width);
    }
    doc.end();
  });
}

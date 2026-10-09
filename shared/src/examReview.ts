import type { ExamMaterialSummary, ExamMindMapNode, ExamReviewArtifacts, ExamSummarySection } from "./types/examMaterial.js";
import { academicNarrationChapters } from "./academicNarration.js";
export { speechChunks } from "./academicNarration.js";

/** Deterministic mock AI adapter. It arranges only authorized source text: no
 * inferred definitions, invented causal relationships, or external material. */
const normalizedTerm = (value: string) => value.normalize("NFKC").replace(/[\u064b-\u065f\u0670\u0640]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();

/** A spoken heading needs a perceptible boundary in browser speech synthesis. */
const spokenHeading = (value: string) => `${value.trim()} …`;

export function examSectionNarration(section: ExamSummarySection): string {
  const topics = section.topics?.filter(topic => !(section.concepts?.length && topic.title === "المفاهيم والمصطلحات الأساسية"));
  return [spokenHeading(section.title), ...(section.objectives?.length ? [spokenHeading("أهداف المحاضرة"), ...section.objectives] : []), ...(topics?.length ? topics.flatMap(topic => [spokenHeading(topic.title), topic.text, topic.details ?? ""]) : [section.text]),
    ...(section.concepts ?? []).map(concept => `${concept.term}: ${concept.definition}`), ...(section.keyPoints.length ? [spokenHeading("نقاط أساسية للمراجعة"), ...section.keyPoints] : [])].filter(Boolean).join("\n\n");
}

export function generateExamReviewArtifacts(summary: ExamMaterialSummary, title: string): ExamReviewArtifacts {
  const nodes: ExamMindMapNode[] = [{ id: "root", parentId: null, kind: "root", label: title, description: summary.introduction, lectureId: null }];
  const edges: ExamReviewArtifacts["mindMap"]["edges"] = [];
  const terms = new Map<string, ExamMindMapNode>();
  for (const section of summary.sections) {
    const lectureId = `lecture:${section.id}`;
    nodes.push({ id: lectureId, parentId: "root", kind: "lecture", label: section.title, description: section.text, lectureId: section.id });
    edges.push({ from: "root", to: lectureId, kind: "contains" });
    const sourceNodes = [
      ...(section.concepts ?? []).map(concept => ({ kind: "concept" as const, label: concept.term, description: concept.definition })),
      ...(section.topics ?? []).filter(topic => !(section.concepts?.length && topic.title === "المفاهيم والمصطلحات الأساسية"))
        .map(topic => ({ kind: "topic" as const, label: topic.title, description: [topic.text, topic.details].filter(Boolean).join("\n\n") })),
    ];
    if (!sourceNodes.length) sourceNodes.push(...section.keyPoints.map(point => ({ kind: "topic" as const, label: point.length > 65 ? `${point.slice(0, 62).trim()}…` : point, description: point })));
    const seen = new Set<string>();
    for (const [index, source] of sourceNodes.entries()) {
      const key = normalizedTerm(source.label);
      if (!key || seen.has(`${source.kind}:${key}`)) continue;
      seen.add(`${source.kind}:${key}`);
      const node: ExamMindMapNode = { ...source, id: `${section.id}:${source.kind}:${index}`, parentId: lectureId, lectureId: section.id };
      nodes.push(node); edges.push({ from: lectureId, to: node.id, kind: "contains" });
      // Identical explicitly named terms form cross-lecture references, never
      // an AI guess about cause, sequence, or equivalence of different terms.
      const previous = terms.get(key);
      if (previous && previous.lectureId !== section.id) edges.push({ from: previous.id, to: node.id, kind: "shared" });
      terms.set(key, node);
    }
  }
  return { generator: "source-mock-v1", mindMap: { nodes, edges }, audioChapters: academicNarrationChapters(summary) };
}

export function examChallengeSeconds(questionCount: number): number {
  return Math.max(300, Math.min(7200, Math.ceil(questionCount) * 90));
}

export function examReadiness(percentage: number): { label: string; advice: string; tone: "strong" | "developing" | "review" } {
  if (percentage >= 80) return { label: "جاهزية مرتفعة", advice: "راجع الأسئلة التي أخطأت فيها، ثم اختبر ثبات فهمك بمحاولة أخرى.", tone: "strong" };
  if (percentage >= 60) return { label: "جاهزية في طور التحسن", advice: "ركّز على مفاهيم الأسئلة غير الصحيحة، واستعن بالملخص والخريطة قبل إعادة التحدي.", tone: "developing" };
  return { label: "تحتاج إلى مراجعة إضافية", advice: "راجع المحاضرات المختارة، ثم تدرب في وضع التعلم قبل خوض تحدٍّ جديد.", tone: "review" };
}

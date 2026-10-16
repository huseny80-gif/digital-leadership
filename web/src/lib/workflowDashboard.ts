import type { ContentImport } from "@shared/index";

export type WorkflowTier = "client" | "master" | "specialist" | "integration";
export type WorkflowState = "waiting" | "running" | "completed" | "failed" | "unknown";
export interface WorkflowNode {
  id: string;
  name: string;
  tier: WorkflowTier;
  task: string;
  path: string;
  parent: string | null;
  progress: number | null;
  state: WorkflowState;
}

export const WORKFLOW_TIERS: Record<WorkflowTier, { label: string; color: string; icon: string }> = {
  client: { label: "العميل / الطلب", color: "أزرق", icon: "users" },
  master: { label: "المنسّق الرئيسي", color: "أخضر", icon: "network" },
  specialist: { label: "الدور المتخصص", color: "أصفر", icon: "settings" },
  integration: { label: "المخرجات والتكامل", color: "بنفسجي", icon: "folder" },
};
export const WORKFLOW_STATES: Record<WorkflowState, string> = {
  waiting: "بانتظار التنفيذ", running: "قيد التنفيذ", completed: "مكتمل", failed: "تعذرت المعالجة", unknown: "غير مقاس",
};
export const IMPORT_STATUSES: Record<ContentImport["status"], string> = {
  uploading: "جارٍ الرفع", queued: "في الانتظار", processing: "قيد المعالجة", completed: "مكتمل", failed: "تعذرت المعالجة",
};
const phases = ["reading", "classifying", "generating", "saving"] as const;

/** The worker advances through these four persisted stages in order. These
 * percentages count completed stages, never elapsed time or token progress.
 * Failed/unknown stages lose their position in the existing API: do not guess. */
export function importWorkflow(job: ContentImport): WorkflowNode[] {
  const index = job.status === "completed" ? phases.length
    : job.status === "queued" || job.status === "uploading" ? 0
    : job.status === "processing" ? phases.findIndex(phase => phase === job.stage) : -1;
  const progress = index < 0 ? null : index * 25;
  const state: WorkflowState = job.status === "completed" ? "completed"
    : job.status === "failed" ? "failed" : job.status === "processing" && index >= 0 ? "running"
    : job.status === "queued" || job.status === "uploading" ? "waiting" : "unknown";
  const accepted = job.status !== "uploading";
  const nodes: WorkflowNode[] = [
    { id: "client", name: "طلب تحديث المحتوى", tier: "client", task: "استلام ملف المحاضرة أو النص المرسل من المدير.", path: "Admin → Content API", parent: null, progress: accepted ? 100 : null, state: accepted ? "completed" : "running" },
    { id: "master", name: "منسّق معالجة المحتوى", tier: "master", task: "تنظيم مراحل قراءة المصدر وتصنيفه وتوليد الأسئلة وحفظ النتائج.", path: "Content API → Worker", parent: "client", progress, state },
  ];
  const definitions = [
    { id: "reading", name: "قراءة المصدر", tier: "specialist", task: "استخراج النص والتحقق من قابليته للقراءة قبل استخدامه.", path: "Worker → Source Reader", parent: "master" },
    { id: "classifying", name: "تصنيف المحتوى", tier: "specialist", task: "تحديد المادة والمحاضرات المناسبة للمحتوى المستخرج.", path: "Source Reader → Classifier", parent: "reading" },
    { id: "generating", name: "إنشاء الأسئلة", tier: "specialist", task: "معالجة نص المحاضرة وإنشاء أسئلة وإجابات مرتبطة بالمصدر.", path: "Classifier → Assessment Generator", parent: "classifying" },
    { id: "saving", name: "حفظ المحتوى والاختبارات", tier: "integration", task: "حفظ المحاضرات والملخصات والأسئلة وتحديث اختبارات المادة.", path: "Assessment Generator → Database", parent: "generating" },
  ] as const;
  return [...nodes, ...definitions.map((definition, phaseIndex): WorkflowNode => ({
    ...definition,
    progress: index < 0 ? null : index > phaseIndex ? 100 : 0,
    state: index < 0 ? "unknown" : index > phaseIndex ? "completed"
      : index === phaseIndex && job.status === "processing" ? "running" : "waiting",
  }))];
}

export function workflowStats(nodes: WorkflowNode[]) {
  return {
    clients: nodes.filter(node => node.tier === "client").length,
    masters: nodes.filter(node => node.tier === "master").length,
    specialists: nodes.filter(node => node.tier === "specialist").length,
    progress: nodes.find(node => node.tier === "master")?.progress ?? null,
  };
}

export type SimulationProgress = readonly [number, number, number, number];
export function advanceSimulation(previous: SimulationProgress): SimulationProgress {
  const next: [number, number, number, number] = [...previous];
  const index = next.findIndex(value => value < 100);
  if (index >= 0) next[index] = Math.min(100, next[index]! + 25);
  return next;
}

/** Demonstration roles are local state only. No provider call, deployment,
 * task creation, or mutation of the real import queue occurs here. */
export function simulationWorkflow(progress: SimulationProgress): WorkflowNode[] {
  const average = Math.round(progress.reduce((total, value) => total + value, 0) / progress.length);
  const base: WorkflowNode[] = [
    { id: "client", name: "عميل تجريبي", tier: "client", task: "إرسال مواصفات مهمة تجريبية.", path: "Demo Client → Gateway", parent: null, progress: 100, state: "completed" },
    { id: "master", name: "المنسّق التجريبي", tier: "master", task: "توجيه المهمة ومتابعة المراحل الأربع بالتسلسل.", path: "Gateway → Demo Director", parent: "client", progress: average, state: average === 100 ? "completed" : "running" },
  ];
  const roles = [
    { id: "research", name: "وكيل البحث — محاكاة", tier: "specialist", task: "جمع سياق المهمة ومراجعها في المثال التجريبي.", path: "Demo Director → Research", parent: "master" },
    { id: "code", name: "Codex — محاكاة", tier: "specialist", task: "تمثيل مرحلة كتابة الكود بعد اكتمال البحث.", path: "Research → Demo Codex", parent: "research" },
    { id: "qa", name: "وكيل الجودة — محاكاة", tier: "specialist", task: "تمثيل مراجعة المخرجات بعد اكتمال البرمجة.", path: "Demo Codex → QA", parent: "code" },
    { id: "output", name: "تسليم المخرجات — محاكاة", tier: "integration", task: "تمثيل تسليم النتيجة بعد اكتمال فحوص الجودة.", path: "QA → Demo Output", parent: "qa" },
  ] as const;
  return [...base, ...roles.map((role, index): WorkflowNode => ({
    ...role, progress: progress[index]!,
    state: progress[index] === 100 ? "completed" : progress[index]! > 0 ? "running" : "waiting",
  }))];
}

export function isContentImportList(value: unknown): value is ContentImport[] {
  return Array.isArray(value) && value.length <= 100 && value.every(job => job && typeof job === "object"
    && typeof job.id === "string" && typeof job.title === "string" && typeof job.stage === "string"
    && Object.hasOwn(IMPORT_STATUSES, job.status) && (job.subjectTitle === null || typeof job.subjectTitle === "string")
    && typeof job.updatedAt === "string" && Number.isFinite(Date.parse(job.updatedAt)));
}

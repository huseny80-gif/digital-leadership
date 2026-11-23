import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { NotFoundState } from "@/components/ui/States";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { SUBJECT_STUDY_IDS } from "@/components/content/studyModules";
import { ReflectiveQuestions } from "@/components/content/ReflectiveQuestions";
import { reflectiveQuestions } from "@/content/reflectiveQuestions";

export default async function ReflectiveQuestionsPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = await params;
  if (subjectId !== SUBJECT_STUDY_IDS.legal) return <NotFoundState message="هذا التبويب غير متاح لهذه المادة." />;
  return <section dir="rtl">
    <Breadcrumbs items={[{ label: "المواد الدراسية", href: "/subjects" }, { label: "الثقافة القانونية والتنظيمية", href: `/subjects/${subjectId}` }, { label: reflectiveQuestions.title }]} />
    <h1 className="page-heading">{reflectiveQuestions.title}</h1>
    <p className="page-subheading">الثقافة القانونية والتنظيمية — {reflectiveQuestions.questions.length} سؤالاً فكرياً بإجاباتها النموذجية.</p>
    <SubjectTabs tabs={subjectTabs(subjectId)} activeKey="reflective-questions" />
    <ReflectiveQuestions />
  </section>;
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { QuestionForAttempt, Quiz } from '@shared/index';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/printing/FloatingPdfButton', () => ({ FloatingPdfButton: () => null }));
import { QuizAttemptRunner } from '@/components/quiz/QuizAttemptRunner';
const quiz: Quiz = {id:'quiz',subjectId:'subject',lectureId:null,title:'اختبار موثق',description:null,timeLimitSeconds:null,status:'published'};
const base = {points:1,options:null,matchItems:null,orderItems:null,difficulty:'medium' as const,lectureId:'lecture-1',lectureNumber:1};
const questions: QuestionForAttempt[] = [
 {...base,id:'mcq',questionType:'multiple_choice',prompt:'سؤال اختيار من متعدد',options:[{id:'a',optionText:'البديل الأول',orderIndex:0},{id:'b',optionText:'البديل الثاني',orderIndex:1}]},
 {...base,id:'tf',questionType:'true_false',prompt:'حكم يستند إلى المحاضرة',options:[{id:'true',optionText:'صح',orderIndex:0},{id:'false',optionText:'خطأ',orderIndex:1}]},
 {...base,id:'match',questionType:'match',prompt:'طابق المفهوم بدلالته',matchItems:{left:[{id:'left-a',text:'المفهوم الأول'},{id:'left-b',text:'المفهوم الثاني'}],right:[{id:'opaque-b',text:'الدلالة الثانية'},{id:'opaque-a',text:'الدلالة الأولى'}]}},
 {...base,id:'order',questionType:'order',prompt:'رتب المراحل وفق المصدر',orderItems:[{id:'later',text:'المرحلة اللاحقة'},{id:'first',text:'المرحلة السابقة'}]},
 {...base,id:'essay',questionType:'open',kind:'essay',prompt:'ناقش المبدأ كما ورد في المحاضرة'},
 {...base,id:'scenario',questionType:'open',kind:'short_scenario',prompt:'حلل الموقف واتخذ القرار المعلل'},
];
beforeEach(()=>sessionStorage.clear());
describe('explicit six-format classification',()=>{
 it('combines very-hard and format filters, retains the draft level and shows its Bloom label without a model answer',()=>{
  const advanced:QuestionForAttempt={...questions[5]!,id:'advanced',difficulty:'very_hard',bloom:'evaluate',prompt:'قيّم خطة الابتكار وفق أطر المحاضرة'};
  const view=render(<QuizAttemptRunner quiz={quiz} questions={[...questions,advanced]} attemptId="advanced-level"/>);
  const levels=screen.getByRole('group',{name:'تصفية حسب الصعوبة'});
  fireEvent.click(within(levels).getByRole('button',{name:'صعب جدًا'}));
  expect(screen.getByRole('heading',{name:advanced.prompt})).toBeInTheDocument();
  expect(screen.getByText('التقييم')).toBeInTheDocument();
  expect(screen.getByText('عدد الأسئلة: 1')).toBeInTheDocument();
  const formats=screen.getByRole('group',{name:'تصفية حسب نوع السؤال'});
  fireEvent.click(within(formats).getByRole('button',{name:'سيناريو قصير (2)'}));
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'إجابة تحليلية محفوظة'}});
  expect(screen.queryByText(/معايير الإجابة النموذجية/)).not.toBeInTheDocument();
  view.unmount();
  render(<QuizAttemptRunner quiz={quiz} questions={[...questions,advanced]} attemptId="advanced-level"/>);
  expect(screen.getByRole('heading',{name:advanced.prompt})).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('إجابة تحليلية محفوظة');
  expect(within(screen.getByRole('group',{name:'تصفية حسب الصعوبة'})).getByRole('button',{name:'صعب جدًا'})).toHaveAttribute('aria-pressed','true');
 });
 it('classifies objective questions, essays and short scenarios separately without exposing models',()=>{
  render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="formats"/>);
  const filters=screen.getByRole('group',{name:'تصفية حسب نوع السؤال'});
  for(const [label,prompt] of [['اختيار من متعدد','سؤال اختيار من متعدد'],['صح / خطأ','حكم يستند إلى المحاضرة'],['مطابقة','طابق المفهوم بدلالته'],['ترتيب','رتب المراحل وفق المصدر'],['مقالي','ناقش المبدأ كما ورد في المحاضرة'],['سيناريو قصير','حلل الموقف واتخذ القرار المعلل']]) {
   fireEvent.click(within(filters).getByRole('button',{name:`${label} (1)`}));
   expect(screen.getByRole('heading',{name:prompt})).toBeInTheDocument();
   expect(screen.getByText('عدد الأسئلة: 1')).toBeInTheDocument();
  }
  expect(screen.queryByText(/معايير الإجابة النموذجية/)).not.toBeInTheDocument();
 });
 it('retains written input and ordering changes when moving between format filters',()=>{
  render(<QuizAttemptRunner quiz={quiz} questions={questions} attemptId="retain"/>);
  const filters=screen.getByRole('group',{name:'تصفية حسب نوع السؤال'});
  fireEvent.click(within(filters).getByRole('button',{name:'مقالي (1)'}));
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'إجابة مبنية على محتوى المحاضرة.'}});
  expect(screen.getByText('مراجعة الإجابات الكتابية وفق النموذج')).toBeInTheDocument();
  fireEvent.click(within(filters).getByRole('button',{name:'ترتيب (1)'}));
  fireEvent.click(screen.getByRole('button',{name:'تحريك لأسفل: المرحلة اللاحقة'}));
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('المرحلة السابقة');
  fireEvent.click(within(filters).getByRole('button',{name:'مقالي (1)'}));
  expect(screen.getByRole('textbox')).toHaveValue('إجابة مبنية على محتوى المحاضرة.');
  fireEvent.click(within(filters).getByRole('button',{name:'ترتيب (1)'}));
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('المرحلة السابقة');
 });
 it('does not display an invented numerical grade for written-only review',()=>{
  render(<QuizAttemptRunner quiz={quiz} questions={questions.slice(4)} attemptId="written" reviewMode/>);
  expect(screen.getByText('مراجعة كتابية')).toBeInTheDocument();
  expect(screen.queryByText(/0 \/ 0/)).not.toBeInTheDocument();
 });
});

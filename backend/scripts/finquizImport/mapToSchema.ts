import type {
  FinquizSubject,
  FinquizQuestion,
  PlannedRow,
  SkippedItem,
} from "./types.js";

/**
 * Maps parsed Finquiz subjects to the rows Digital Leadership's
 * production schema would need — per the mapping table in Phase 19 §2.
 * Pure function: takes data in, returns planned rows + explicitly
 * skipped items out. No side effects, no database access.
 *
 * Fields with no production schema destination (Phase 19 §3: summaries,
 * references, updates, lecture.objectives, assignment.difficulty/due,
 * question.lectureId) are recorded as `SkippedItem`s, never silently
 * dropped — a reviewer must see exactly what this plan does not cover.
 */
export function mapSubjectToSchema(
  subject: FinquizSubject,
): { rows: PlannedRow[]; skipped: SkippedItem[] } {
  const rows: PlannedRow[] = [];
  const skipped: SkippedItem[] = [];

  rows.push({
    table: "subjects",
    summary: `Subject: ${subject.title}`,
    sourceId: subject.id,
    fields: {
      title: subject.title,
      description: subject.description ?? null,
      status: subject.status ?? "draft",
      order_index: subject.order ?? 0,
    },
  });

  for (const lecture of subject.lectures ?? []) {
    rows.push({
      table: "lectures",
      summary: `Lecture ${lecture.number ?? "?"}: ${lecture.title}`,
      sourceId: lecture.id,
      fields: {
        subject_id: `<subjects.id for ${subject.id}>`,
        title: lecture.title,
        description: lecture.description ?? null,
        status: lecture.status ?? "draft",
        order_index: lecture.number ?? 0,
      },
    });

    if (lecture.objectives?.length) {
      skipped.push({
        sourceId: lecture.id,
        category: "lectures.objectives",
        reason: `Lecture has ${lecture.objectives.length} objective(s) — no 'lectures.objectives' column exists in the production schema (Phase 19 §3.4).`,
      });
    }

    for (const file of lecture.files ?? []) {
      if (!file.url) {
        skipped.push({
          sourceId: lecture.id,
          category: "lectures.files",
          reason: `File "${file.label ?? file.type}" has url:null (Finquiz placeholder, not yet produced) — cannot be imported.`,
        });
        continue;
      }
      rows.push({
        table: "files + lecture_items",
        summary: `File for lecture "${lecture.title}": ${file.label ?? file.type}`,
        sourceId: lecture.id,
        fields: {
          storage_source_path: file.url,
          item_type: "pdf",
          title: file.label ?? lecture.title,
          lecture_id: `<lectures.id for ${lecture.id}>`,
        },
      });
    }
  }

  for (const summary of subject.summaries ?? []) {
    skipped.push({
      sourceId: summary.id,
      category: "summaries",
      reason: `No 'summaries' table or lecture-item-type exists in production (Phase 19 §3.1) — "${summary.title}" has no destination.`,
    });
  }

  for (const assignment of subject.assignments ?? []) {
    rows.push({
      table: "assignments",
      summary: `Assignment: ${assignment.title}`,
      sourceId: assignment.id,
      fields: {
        subject_id: `<subjects.id for ${subject.id}>`,
        lecture_id: null,
        title: assignment.title,
        description: assignment.description ?? null,
        status: assignment.status ?? "draft",
      },
    });
    if (assignment.difficulty) {
      skipped.push({
        sourceId: assignment.id,
        category: "assignments.difficulty",
        reason: `difficulty="${assignment.difficulty}" — no 'assignments.difficulty' column exists (Phase 19 §3.5).`,
      });
    }
    if (assignment.due) {
      skipped.push({
        sourceId: assignment.id,
        category: "assignments.due",
        reason: `due="${assignment.due}" — no 'assignments.due' column exists (Phase 19 §3.5).`,
      });
    }
  }

  for (const quiz of subject.quizzes ?? []) {
    rows.push({
      table: "question_banks",
      summary: `Question bank for quiz: ${quiz.title}`,
      sourceId: quiz.id,
      fields: {
        subject_id: `<subjects.id for ${subject.id}>`,
        title: quiz.title,
      },
    });
    rows.push({
      table: "quizzes",
      summary: `Quiz: ${quiz.title}`,
      sourceId: quiz.id,
      fields: {
        subject_id: `<subjects.id for ${subject.id}>`,
        title: quiz.title,
        description: quiz.description ?? null,
        status: quiz.status ?? "draft",
      },
    });

    for (const [index, question] of quiz.questions.entries()) {
      rows.push(...mapQuestion(question, quiz.id, index));
      if (question.lectureId) {
        skipped.push({
          sourceId: question.id,
          category: "questions.lectureId",
          reason: `lectureId="${question.lectureId}" — questions/question_banks have no lecture_id foreign key in production (Phase 19 §3.6).`,
        });
      }
    }
  }

  for (const reference of subject.references ?? []) {
    skipped.push({
      sourceId: reference.id,
      category: "references",
      reason: `No 'references' table exists in production (Phase 19 §3.2) — "${reference.title}" has no destination.`,
    });
  }

  for (const resource of subject.resources ?? []) {
    if (!resource.url) {
      skipped.push({
        sourceId: resource.id,
        category: "resources",
        reason: `Resource "${resource.title}" has url:null (Finquiz placeholder) — cannot be imported.`,
      });
      continue;
    }
    skipped.push({
      sourceId: resource.id,
      category: "resources",
      reason: `Resource "${resource.title}" has a real URL but Finquiz's per-subject 'resources' list has no clean 1:1 production destination distinct from 'files' (Phase 19 §2/§3) — needs an explicit decision before mapping, not an assumption.`,
    });
  }

  for (const update of subject.updates ?? []) {
    skipped.push({
      sourceId: update.id,
      category: "updates",
      reason: `No changelog/activity-feed table exists in production (Phase 19 §3.3) — "${update.title}" has no destination.`,
    });
  }

  return { rows, skipped };
}

function mapQuestion(question: FinquizQuestion, quizSourceId: string, orderIndex: number): PlannedRow[] {
  const rows: PlannedRow[] = [];
  const questionTypeMap: Record<FinquizQuestion["type"], string> = {
    mcq: "multiple_choice",
    tf: "true_false",
    fill: "fill",
    match: "match",
    order: "order",
    open: "open",
  };

  rows.push({
    table: "questions",
    summary: `Question (${question.type}): ${question.prompt.slice(0, 60)}${question.prompt.length > 60 ? "…" : ""}`,
    sourceId: question.id,
    fields: {
      question_bank_id: `<question_banks.id for ${quizSourceId}>`,
      question_type: questionTypeMap[question.type],
      prompt: question.prompt,
      explanation: question.explanation ?? null,
      rubric: question.type === "open" ? (question.rubric ?? null) : undefined,
      order_index: orderIndex,
    },
  });

  if (question.type === "mcq" && question.options) {
    const answerIndex = typeof question.answer === "number" ? question.answer : null;
    question.options.forEach((optionText, i) => {
      rows.push({
        table: "question_options",
        summary: `Option ${i + 1} for question ${question.id}`,
        sourceId: question.id,
        fields: {
          question_id: `<questions.id for ${question.id}>`,
          option_text: optionText,
          is_correct: i === answerIndex,
          order_index: i,
        },
      });
    });
  }

  if (question.type === "tf") {
    const isTrue = question.answer === true;
    rows.push(
      {
        table: "question_options",
        summary: `True option for question ${question.id}`,
        sourceId: question.id,
        fields: { question_id: `<questions.id for ${question.id}>`, option_text: "True", is_correct: isTrue, order_index: 0 },
      },
      {
        table: "question_options",
        summary: `False option for question ${question.id}`,
        sourceId: question.id,
        fields: { question_id: `<questions.id for ${question.id}>`, option_text: "False", is_correct: !isTrue, order_index: 1 },
      },
    );
  }

  if (question.type === "fill" && Array.isArray(question.answer)) {
    question.answer.forEach((answerText, i) => {
      rows.push({
        table: "question_accepted_answers",
        summary: `Accepted answer ${i + 1} for question ${question.id}`,
        sourceId: question.id,
        fields: { question_id: `<questions.id for ${question.id}>`, answer_text: answerText, order_index: i },
      });
    });
  }

  if (question.type === "match" && question.pairs) {
    question.pairs.forEach((pair, i) => {
      rows.push({
        table: "question_pairs",
        summary: `Pair ${i + 1} for question ${question.id}`,
        sourceId: question.id,
        fields: { question_id: `<questions.id for ${question.id}>`, left_text: pair.left, right_text: pair.right, order_index: i },
      });
    });
  }

  if (question.type === "order" && question.items) {
    question.items.forEach((itemText, i) => {
      rows.push({
        table: "question_items",
        summary: `Item ${i + 1} for question ${question.id}`,
        sourceId: question.id,
        fields: { question_id: `<questions.id for ${question.id}>`, item_text: itemText, correct_order_index: i },
      });
    });
  }

  return rows;
}

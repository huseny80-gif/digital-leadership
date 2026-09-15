import type { Pool } from "pg";
import type { AdminQuestion, AdminQuestionOption, AdminQuizQuestionLink, QuestionBank, QuestionType, Quiz, PublicationStatus } from "@shared/index";
import type { AdminAssessmentsRepository } from "./adminAssessmentsRepository.js";
import { conflict, notFound } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * Admin business logic for question banks/questions/options/quizzes
 * (PHASE 09C). Every response type here (`AdminQuestion`,
 * `AdminQuestionOption`) carries `isCorrect` — this service is never
 * imported by a learner-facing route (see `AdminAssessmentsRepository`'s
 * doc comment for why that separation is structural, not incidental).
 */
export class AdminAssessmentsService {
  constructor(private readonly pool: Pool, private readonly repository: AdminAssessmentsRepository) {}

  listQuestionBanks(): Promise<QuestionBank[]> {
    return this.repository.listQuestionBanks();
  }

  async getQuestionBankOrThrow(id: string): Promise<QuestionBank> {
    const bank = await this.repository.getQuestionBank(id);
    if (!bank) throw notFound("Question bank");
    return bank;
  }

  async createQuestionBank(input: { subjectId: string | null; title: string; description: string | null }, actorUserId: string): Promise<QuestionBank> {
    if (input.subjectId) {
      const exists = await this.repository.subjectExists(input.subjectId);
      if (!exists) throw new ValidationError("The specified subject does not exist.");
    }
    const bank = await this.repository.createQuestionBank({ ...input, createdBy: actorUserId });
    await writeAuditLog(this.pool, { actorUserId, action: "question_bank.created", entityType: "question_bank", entityId: bank.id, metadata: { title: bank.title } });
    return bank;
  }

  async updateQuestionBank(id: string, fields: { title?: string; description?: string | null }, actorUserId: string): Promise<QuestionBank> {
    const updated = await this.repository.updateQuestionBank(id, fields);
    if (!updated) throw notFound("Question bank");
    await writeAuditLog(this.pool, { actorUserId, action: "question_bank.updated", entityType: "question_bank", entityId: id });
    return updated;
  }

  async deleteQuestionBank(id: string, actorUserId: string): Promise<void> {
    const deleted = await this.repository.softDeleteQuestionBank(id);
    if (!deleted) throw notFound("Question bank");
    await writeAuditLog(this.pool, { actorUserId, action: "question_bank.deleted", entityType: "question_bank", entityId: id });
  }

  async listQuestionsOrThrow(questionBankId: string): Promise<AdminQuestion[]> {
    await this.getQuestionBankOrThrow(questionBankId);
    return this.repository.listQuestions(questionBankId);
  }

  async getQuestionOrThrow(id: string): Promise<AdminQuestion> {
    const question = await this.repository.getQuestion(id);
    if (!question) throw notFound("Question");
    return question;
  }

  async createQuestion(
    input: { questionBankId: string; questionType: QuestionType; prompt: string; points: number },
    actorUserId: string,
  ): Promise<AdminQuestion> {
    await this.getQuestionBankOrThrow(input.questionBankId);
    const created = await this.repository.createQuestion({ ...input, createdBy: actorUserId });
    await writeAuditLog(this.pool, { actorUserId, action: "question.created", entityType: "question", entityId: created.id, metadata: { questionBankId: input.questionBankId } });
    return this.getQuestionOrThrow(created.id);
  }

  async updateQuestion(id: string, fields: { prompt?: string; points?: number }, actorUserId: string): Promise<AdminQuestion> {
    const updated = await this.repository.updateQuestion(id, fields);
    if (!updated) throw notFound("Question");
    await writeAuditLog(this.pool, { actorUserId, action: "question.updated", entityType: "question", entityId: id });
    return this.getQuestionOrThrow(id);
  }

  async deleteQuestion(id: string, actorUserId: string): Promise<void> {
    const deleted = await this.repository.softDeleteQuestion(id);
    if (!deleted) throw notFound("Question");
    await writeAuditLog(this.pool, { actorUserId, action: "question.deleted", entityType: "question", entityId: id });
  }

  async addOption(
    questionId: string,
    input: { optionText: string; isCorrect: boolean; orderIndex: number },
    actorUserId: string,
  ): Promise<AdminQuestionOption> {
    const exists = await this.repository.questionExists(questionId);
    if (!exists) throw notFound("Question");
    const option = await this.repository.createOption({ questionId, ...input });
    await writeAuditLog(this.pool, { actorUserId, action: "question_option.created", entityType: "question_option", entityId: option.id, metadata: { questionId } });
    return option;
  }

  async updateOption(
    questionId: string,
    optionId: string,
    fields: { optionText?: string; isCorrect?: boolean; orderIndex?: number },
    actorUserId: string,
  ): Promise<void> {
    const belongs = await this.repository.optionBelongsToQuestion(optionId, questionId);
    if (!belongs) throw notFound("Question option");
    const updated = await this.repository.updateOption(optionId, fields);
    if (!updated) throw notFound("Question option");
    await writeAuditLog(this.pool, {
      actorUserId,
      action: "question_option.updated",
      entityType: "question_option",
      entityId: optionId,
      // Never logs option text/correctness content itself — only that a
      // change happened and which fields, per DATABASE_SECURITY.md §8's
      // "no sensitive content in audit metadata."
      metadata: { questionId, fields: Object.keys(fields) },
    });
  }

  async deleteOption(questionId: string, optionId: string, actorUserId: string): Promise<void> {
    const belongs = await this.repository.optionBelongsToQuestion(optionId, questionId);
    if (!belongs) throw notFound("Question option");
    const referenced = await this.repository.optionReferencedByAnswers(optionId);
    if (referenced) {
      throw conflict("This option cannot be deleted because it is part of a learner's recorded quiz history.");
    }
    const deleted = await this.repository.deleteOption(optionId);
    if (!deleted) throw notFound("Question option");
    await writeAuditLog(this.pool, { actorUserId, action: "question_option.deleted", entityType: "question_option", entityId: optionId, metadata: { questionId } });
  }

  listQuizzes(): Promise<Quiz[]> {
    return this.repository.listQuizzes();
  }

  async getQuizOrThrow(id: string): Promise<Quiz> {
    const quiz = await this.repository.getQuiz(id);
    if (!quiz) throw notFound("Quiz");
    return quiz;
  }

  async createQuiz(
    input: { subjectId: string; lectureId: string | null; title: string; description: string | null; timeLimitSeconds: number | null },
    actorUserId: string,
  ): Promise<Quiz> {
    const subjectExists = await this.repository.subjectExists(input.subjectId);
    if (!subjectExists) throw new ValidationError("The specified subject does not exist.");
    const quiz = await this.repository.createQuiz({ ...input, createdBy: actorUserId });
    await writeAuditLog(this.pool, { actorUserId, action: "quiz.created", entityType: "quiz", entityId: quiz.id, metadata: { subjectId: input.subjectId } });
    return quiz;
  }

  async updateQuiz(
    id: string,
    fields: { title?: string; description?: string | null; timeLimitSeconds?: number | null; status?: PublicationStatus },
    actorUserId: string,
  ): Promise<Quiz> {
    const updated = await this.repository.updateQuiz(id, fields);
    if (!updated) throw notFound("Quiz");
    await writeAuditLog(this.pool, { actorUserId, action: "quiz.updated", entityType: "quiz", entityId: id, metadata: { fields: Object.keys(fields) } });
    return updated;
  }

  async deleteQuiz(id: string, actorUserId: string): Promise<void> {
    const deleted = await this.repository.softDeleteQuiz(id);
    if (!deleted) throw notFound("Quiz");
    await writeAuditLog(this.pool, { actorUserId, action: "quiz.deleted", entityType: "quiz", entityId: id });
  }

  async listQuizQuestionsOrThrow(quizId: string): Promise<AdminQuizQuestionLink[]> {
    await this.getQuizOrThrow(quizId);
    return this.repository.listQuizQuestions(quizId);
  }

  async addQuestionToQuiz(quizId: string, questionId: string, orderIndex: number, actorUserId: string): Promise<void> {
    await this.getQuizOrThrow(quizId);
    const questionExists = await this.repository.questionExists(questionId);
    if (!questionExists) throw new ValidationError("The specified question does not exist.");
    await this.repository.addQuestionToQuiz(quizId, questionId, orderIndex);
    await writeAuditLog(this.pool, { actorUserId, action: "quiz.question_added", entityType: "quiz", entityId: quizId, metadata: { questionId } });
  }

  async removeQuestionFromQuiz(quizId: string, questionId: string, actorUserId: string): Promise<void> {
    const removed = await this.repository.removeQuestionFromQuiz(quizId, questionId);
    if (!removed) throw notFound("Quiz question");
    await writeAuditLog(this.pool, { actorUserId, action: "quiz.question_removed", entityType: "quiz", entityId: quizId, metadata: { questionId } });
  }
}

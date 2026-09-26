// SessionService — all DB operations for live sessions.
// Correct answers, scoring, and leaderboard are computed here (server-side only).
// correctOptionId is NEVER returned to participants.

import { prisma } from "@/lib/prisma";
import { issueGuestToken, verifyGuestToken, hashToken } from "./guest-token";
import { randomBytes } from "crypto";

const SCORE_CORRECT = 10;

// ── Session creation ──────────────────────────────────────────────────────────

export async function createSession(
  programId: string,
  instructorId: string,
  dayNumber: number,
  title?: string
) {
  // Verify ownership
  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
  });
  if (!program) throw new Error("PROGRAM_NOT_FOUND");

  // Verify questions exist for the day
  const day = await prisma.trainingDay.findFirst({
    where: { programId, dayNumber },
    include: { questions: { where: { status: { in: ["APPROVED", "DRAFT"] } } } },
  });
  if (!day || day.questions.length === 0) throw new Error("NO_QUESTIONS_FOR_DAY");

  // Generate unique session code
  const sessionCode = await generateUniqueCode();

  const session = await prisma.liveSession.create({
    data: {
      programId,
      instructorId,
      sessionCode,
      dayNumber,
      title: title ?? `${program.title} — Day ${dayNumber}`,
      status: "DRAFT",
    },
  });

  // Create SessionQuestion rows (ordered)
  for (const q of day.questions.sort((a, b) => a.questionOrder - b.questionOrder)) {
    await prisma.sessionQuestion.create({
      data: {
        sessionId: session.id,
        questionId: q.id,
        questionOrder: q.questionOrder,
        status: "DRAFT",
      },
    });
  }

  return session;
}

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomBytes(3).toString("hex").toUpperCase(); // e.g. "A3F2B1"
    const existing = await prisma.liveSession.findUnique({ where: { sessionCode: code } });
    if (!existing) return code;
  }
  throw new Error("FAILED_TO_GENERATE_CODE");
}

// ── Participant join ──────────────────────────────────────────────────────────

export async function participantJoin(sessionCode: string, displayName: string) {
  const code = sessionCode.trim().toUpperCase();
  const name = displayName.trim();
  if (!name || name.length < 2 || name.length > 50) throw new Error("INVALID_DISPLAY_NAME");

  const session = await prisma.liveSession.findUnique({ where: { sessionCode: code } });
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status === "ENDED") throw new Error("SESSION_ENDED");
  if (session.status === "DRAFT") throw new Error("SESSION_NOT_STARTED");

  // Check join deadline
  if (session.joinDeadlineAt && new Date() > session.joinDeadlineAt) {
    throw new Error("JOIN_DEADLINE_PASSED");
  }

  // Issue guest token with temp participantId (will be updated after DB create)
  const tempId = randomBytes(16).toString("hex");
  const tempToken = issueGuestToken({ participantId: tempId, sessionId: session.id, displayName: name });
  const tokenHash = hashToken(tempToken);

  const participant = await prisma.sessionParticipant.create({
    data: {
      sessionId: session.id,
      displayName: name,
      joinTokenHash: tokenHash,
      status: "JOINED",
    },
  });

  // Issue final token with real participantId
  const token = issueGuestToken({ participantId: participant.id, sessionId: session.id, displayName: name });
  const finalHash = hashToken(token);
  await prisma.sessionParticipant.update({
    where: { id: participant.id },
    data: { joinTokenHash: finalHash },
  });

  return { token, participantId: participant.id, sessionId: session.id };
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

export async function startSession(sessionId: string, instructorId: string) {
  const session = await requireOwnership(sessionId, instructorId);
  if (session.status !== "DRAFT") throw new Error("INVALID_STATE");

  return prisma.liveSession.update({
    where: { id: sessionId },
    data: { status: "ACTIVE", startedAt: new Date() },
  });
}

export async function pauseSession(sessionId: string, instructorId: string) {
  const session = await requireOwnership(sessionId, instructorId);
  if (session.status !== "ACTIVE") throw new Error("INVALID_STATE");
  return prisma.liveSession.update({ where: { id: sessionId }, data: { status: "PAUSED" } });
}

export async function resumeSession(sessionId: string, instructorId: string) {
  const session = await requireOwnership(sessionId, instructorId);
  if (session.status !== "PAUSED") throw new Error("INVALID_STATE");
  return prisma.liveSession.update({ where: { id: sessionId }, data: { status: "ACTIVE" } });
}

export async function endSession(sessionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);
  const session = await prisma.liveSession.update({
    where: { id: sessionId },
    data: { status: "ENDED", endedAt: new Date() },
  });
  await computeSessionResult(sessionId);
  return session;
}

// ── Question lifecycle ────────────────────────────────────────────────────────

export async function showQuestion(sessionId: string, sessionQuestionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);

  const sq = await prisma.sessionQuestion.findFirst({
    where: { id: sessionQuestionId, sessionId },
  });
  if (!sq) throw new Error("QUESTION_NOT_IN_SESSION");
  if (sq.status !== "DRAFT" && sq.status !== "READY") throw new Error("INVALID_QUESTION_STATE");

  const updated = await prisma.sessionQuestion.update({
    where: { id: sessionQuestionId },
    data: { status: "LIVE", startedAt: new Date() },
  });
  await prisma.liveSession.update({
    where: { id: sessionId },
    data: { currentQuestionId: sessionQuestionId },
  });

  return updated;
}

export async function closeQuestion(sessionId: string, sessionQuestionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);

  const sq = await prisma.sessionQuestion.findFirst({
    where: { id: sessionQuestionId, sessionId },
  });
  if (!sq) throw new Error("QUESTION_NOT_IN_SESSION");
  if (sq.status !== "LIVE") throw new Error("QUESTION_NOT_LIVE");

  return prisma.sessionQuestion.update({
    where: { id: sessionQuestionId },
    data: { status: "CLOSED", closedAt: new Date() },
  });
}

export async function showResults(sessionId: string, sessionQuestionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);

  await prisma.sessionQuestion.update({
    where: { id: sessionQuestionId },
    data: { status: "RESULTS", resultsShownAt: new Date() },
  });

  return buildQuestionResult(sessionQuestionId);
}

export async function nextQuestion(sessionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);

  const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("SESSION_NOT_FOUND");

  // Find next DRAFT/READY question by order
  const currentSQ = session.currentQuestionId
    ? await prisma.sessionQuestion.findUnique({ where: { id: session.currentQuestionId } })
    : null;
  const currentOrder = currentSQ?.questionOrder ?? 0;

  const next = await prisma.sessionQuestion.findFirst({
    where: { sessionId, questionOrder: { gt: currentOrder }, status: { in: ["DRAFT", "READY"] } },
    orderBy: { questionOrder: "asc" },
  });

  return next ?? null;
}

// ── Answer submission (transaction-safe, idempotent) ─────────────────────────

export async function submitAnswer(
  participantToken: string,
  sessionQuestionId: string,
  selectedOptionId: string,
  timeTakenSeconds?: number
) {
  // Verify guest token — prevents spoofed participantId from client
  let tokenPayload: { participantId: string; sessionId: string };
  try {
    tokenPayload = verifyGuestToken(participantToken);
  } catch {
    throw new Error("INVALID_TOKEN");
  }

  const { participantId, sessionId } = tokenPayload;

  // Atomic transaction: prevents concurrent duplicate submissions
  return prisma.$transaction(async (tx) => {
    // Verify SessionQuestion is LIVE
    const sq = await tx.sessionQuestion.findFirst({
      where: { id: sessionQuestionId, sessionId },
      include: {
        question: {
          include: { options: true },
        },
      },
    });
    if (!sq) throw new Error("QUESTION_NOT_FOUND");
    if (sq.status !== "LIVE") throw new Error("QUESTION_NOT_LIVE");

    // Verify participant belongs to this session
    const participant = await tx.sessionParticipant.findFirst({
      where: { id: participantId, sessionId },
    });
    if (!participant) throw new Error("PARTICIPANT_NOT_IN_SESSION");

    // Verify selected option belongs to the question
    const option = sq.question.options.find((o) => o.id === selectedOptionId);
    if (!option) throw new Error("INVALID_OPTION");

    // Idempotency check: final answer already recorded for this participant+question
    const existing = await tx.participantAnswer.findFirst({
      where: { sessionQuestionId, participantId, isFinal: true },
    });
    if (existing) return { duplicate: true, answer: existing };

    // Score server-side
    const isCorrect = sq.question.correctOptionId === selectedOptionId;
    const scoreAwarded = isCorrect ? SCORE_CORRECT : 0;

    // Insert answer (partial unique index enforces uniqueness at DB level)
    const answer = await tx.participantAnswer.create({
      data: {
        sessionId,
        sessionQuestionId,
        participantId,
        selectedOptionId,
        isCorrect,
        scoreAwarded,
        isFinal: true,
        timeTakenSeconds: timeTakenSeconds ?? null,
      },
    });

    // Update participant running totals
    await tx.sessionParticipant.update({
      where: { id: participantId },
      data: {
        totalScore: { increment: scoreAwarded },
        answersCount: { increment: 1 },
        correctCount: { increment: isCorrect ? 1 : 0 },
        lastSeenAt: new Date(),
      },
    });

    return { duplicate: false, answer };
  });
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboard(sessionId: string) {
  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId },
    orderBy: [{ totalScore: "desc" }, { correctCount: "desc" }, { joinedAt: "asc" }],
    select: {
      id: true,
      displayName: true,
      totalScore: true,
      rank: true,
      correctCount: true,
      answersCount: true,
    },
  });

  return participants.map((p, i) => ({
    participantId: p.id,
    displayName: p.displayName,
    totalScore: Number(p.totalScore),
    rank: i + 1,
    correctCount: p.correctCount,
    answersCount: p.answersCount,
  }));
}

// ── Safe question payload (no correct answer) ─────────────────────────────────

export async function getLiveQuestionPayload(sessionQuestionId: string) {
  const sq = await prisma.sessionQuestion.findUnique({
    where: { id: sessionQuestionId },
    include: {
      question: {
        include: {
          options: { orderBy: { displayOrder: "asc" } },
        },
      },
    },
  });
  if (!sq) throw new Error("NOT_FOUND");

  return {
    sessionQuestionId: sq.id,
    questionId: sq.questionId,
    questionText: sq.question.questionText,
    options: sq.question.options.map((o) => ({
      id: o.id,
      optionLabel: o.optionLabel,
      optionText: o.optionText,
      displayOrder: o.displayOrder,
      // correctOptionId deliberately NOT included
    })),
    questionOrder: sq.questionOrder,
    timeLimitSeconds: sq.timeLimitSeconds,
    startedAt: sq.startedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// ── Question result (correct answer revealed — instructor + post-close only) ──

export async function buildQuestionResult(sessionQuestionId: string) {
  const sq = await prisma.sessionQuestion.findUnique({
    where: { id: sessionQuestionId },
    include: {
      question: true,
      answers: { where: { isFinal: true } },
    },
  });
  if (!sq) throw new Error("NOT_FOUND");

  const answerCounts: Record<string, number> = {};
  for (const ans of sq.answers) {
    answerCounts[ans.selectedOptionId] = (answerCounts[ans.selectedOptionId] ?? 0) + 1;
  }

  return {
    sessionQuestionId: sq.id,
    correctOptionId: sq.question.correctOptionId ?? "",
    answerCounts,
    correctCount: sq.answers.filter((a) => a.isCorrect).length,
    totalAnswers: sq.answers.length,
  };
}

// ── Session result computation ────────────────────────────────────────────────

async function computeSessionResult(sessionId: string) {
  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId },
    select: { id: true, totalScore: true, correctCount: true, answersCount: true },
  });

  if (participants.length === 0) return;

  const scores = participants.map((p) => Number(p.totalScore));
  const totalAnswers = participants.reduce((s, p) => s + p.answersCount, 0);
  const totalCorrect = participants.reduce((s, p) => s + p.correctCount, 0);
  const sessionQuestions = await prisma.sessionQuestion.count({ where: { sessionId } });

  await prisma.sessionResult.upsert({
    where: { sessionId },
    create: {
      sessionId,
      totalParticipants: participants.length,
      totalQuestions: sessionQuestions,
      totalAnswers,
      totalCorrect,
      correctRate: totalAnswers > 0 ? totalCorrect / totalAnswers : 0,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      highestScore: Math.max(...scores),
      computedAt: new Date(),
    },
    update: {
      totalParticipants: participants.length,
      totalAnswers,
      totalCorrect,
      correctRate: totalAnswers > 0 ? totalCorrect / totalAnswers : 0,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      highestScore: Math.max(...scores),
      computedAt: new Date(),
    },
  });

  // Update ranks on participants
  const sorted = [...participants].sort((a, b) => Number(b.totalScore) - Number(a.totalScore));
  for (let i = 0; i < sorted.length; i++) {
    await prisma.sessionParticipant.update({
      where: { id: sorted[i].id },
      data: { rank: i + 1 },
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireOwnership(sessionId: string, instructorId: string) {
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, instructorId },
  });
  if (!session) throw new Error("SESSION_NOT_FOUND_OR_UNAUTHORIZED");
  return session;
}

export async function getSessionByCode(code: string) {
  return prisma.liveSession.findUnique({ where: { sessionCode: code.trim().toUpperCase() } });
}

export async function getSessionQuestions(sessionId: string) {
  return prisma.sessionQuestion.findMany({
    where: { sessionId },
    orderBy: { questionOrder: "asc" },
    include: { question: { select: { questionText: true, questionOrder: true } } },
  });
}

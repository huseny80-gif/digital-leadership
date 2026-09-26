"use server";

import { auth } from "@/lib/auth";
import { verifyGuestToken } from "@/lib/session/guest-token";
import {
  createSession,
  startSession,
  pauseSession,
  resumeSession,
  endSession,
  showQuestion,
  closeQuestion,
  showResults,
  nextQuestion,
  getLeaderboard,
  getSessionByCode,
  getSessionQuestions,
  participantJoin,
} from "@/lib/session/service";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

async function requireInstructor(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user.id;
}

export async function createLiveSession(
  programId: string,
  dayNumber: number,
  title?: string
) {
  const instructorId = await requireInstructor();
  return createSession(programId, instructorId, dayNumber, title);
}

export async function startLiveSession(sessionId: string) {
  const instructorId = await requireInstructor();
  return startSession(sessionId, instructorId);
}

export async function pauseLiveSession(sessionId: string) {
  const instructorId = await requireInstructor();
  return pauseSession(sessionId, instructorId);
}

export async function resumeLiveSession(sessionId: string) {
  const instructorId = await requireInstructor();
  return resumeSession(sessionId, instructorId);
}

export async function endLiveSession(sessionId: string) {
  const instructorId = await requireInstructor();
  return endSession(sessionId, instructorId);
}

export async function showLiveQuestion(sessionId: string, sessionQuestionId: string) {
  const instructorId = await requireInstructor();
  return showQuestion(sessionId, sessionQuestionId, instructorId);
}

export async function closeLiveQuestion(sessionId: string, sessionQuestionId: string) {
  const instructorId = await requireInstructor();
  return closeQuestion(sessionId, sessionQuestionId, instructorId);
}

export async function showQuestionResults(sessionId: string, sessionQuestionId: string) {
  const instructorId = await requireInstructor();
  return showResults(sessionId, sessionQuestionId, instructorId);
}

export async function getNextQuestion(sessionId: string) {
  const instructorId = await requireInstructor();
  return nextQuestion(sessionId, instructorId);
}

export async function getSessionLeaderboard(sessionId: string) {
  await requireInstructor();
  return getLeaderboard(sessionId);
}

export async function getSessionInfo(sessionCode: string) {
  return getSessionByCode(sessionCode);
}

export async function listInstructorSessions(programId?: string) {
  const instructorId = await requireInstructor();
  return prisma.liveSession.findMany({
    where: { instructorId, ...(programId ? { programId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { participants: true, sessionQuestions: true } },
    },
  });
}

export async function getSessionDetails(sessionId: string) {
  const instructorId = await requireInstructor();
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, instructorId },
    include: {
      sessionQuestions: {
        orderBy: { questionOrder: "asc" },
        include: { question: { select: { questionText: true, questionOrder: true } } },
      },
      _count: { select: { participants: true } },
    },
  });
  if (!session) throw new Error("SESSION_NOT_FOUND");
  return session;
}

export async function getSessionQuestionsAction(sessionId: string) {
  await requireInstructor();
  return getSessionQuestions(sessionId);
}

export async function getSessionResults(sessionId: string) {
  const instructorId = await requireInstructor();

  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, instructorId },
    include: {
      sessionResult: true,
      participants: {
        orderBy: [{ totalScore: "desc" }, { correctCount: "desc" }],
      },
      sessionQuestions: {
        orderBy: { questionOrder: "asc" },
        include: {
          question: { select: { questionText: true, questionOrder: true } },
          answers: {
            where: { isFinal: true },
            select: { isCorrect: true, participantId: true },
          },
        },
      },
    },
  });

  if (!session) throw new Error("SESSION_NOT_FOUND");

  const totalQ = session.sessionQuestions.length;

  const participants = session.participants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    joinedAt: p.joinedAt,
    totalScore: Number(p.totalScore),
    answersCount: p.answersCount,
    correctCount: p.correctCount,
    wrongCount: p.answersCount - p.correctCount,
    rank: p.rank,
    percentage: totalQ > 0 ? Math.round((p.correctCount / totalQ) * 100) : 0,
  }));

  const questions = session.sessionQuestions.map((sq) => ({
    sessionQuestionId: sq.id,
    questionOrder: sq.questionOrder,
    questionText: sq.question.questionText,
    totalAnswers: sq.answers.length,
    correctAnswers: sq.answers.filter((a) => a.isCorrect).length,
    accuracy:
      sq.answers.length > 0
        ? Math.round(
            (sq.answers.filter((a) => a.isCorrect).length / sq.answers.length) * 100
          )
        : 0,
  }));

  const sr = session.sessionResult;
  return {
    participants,
    questions,
    statistics: sr
      ? {
          totalParticipants: sr.totalParticipants,
          totalQuestions: sr.totalQuestions,
          totalAnswers: sr.totalAnswers,
          totalCorrect: sr.totalCorrect,
          correctRate: Number(sr.correctRate),
          averageScore: Number(sr.averageScore),
          highestScore: Number(sr.highestScore),
        }
      : null,
  };
}

/** Participant result — identified by guest_token (no instructor auth) */
export async function getParticipantResult(sessionCode: string, token: string) {
  const code = sessionCode.trim().toUpperCase();

  let participantId: string;
  try {
    const payload = verifyGuestToken(token);
    participantId = payload.participantId;
  } catch {
    throw new Error("INVALID_TOKEN");
  }

  const liveSession = await prisma.liveSession.findUnique({
    where: { sessionCode: code },
    include: { sessionResult: true },
  });
  if (!liveSession) throw new Error("SESSION_NOT_FOUND");

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, sessionId: liveSession.id },
  });
  if (!participant) throw new Error("PARTICIPANT_NOT_FOUND");

  const totalQuestions = await prisma.sessionQuestion.count({
    where: { sessionId: liveSession.id },
  });

  return {
    participant: {
      id: participant.id,
      displayName: participant.displayName,
      totalScore: Number(participant.totalScore),
      correctCount: participant.correctCount,
      wrongCount: participant.answersCount - participant.correctCount,
      answersCount: participant.answersCount,
      rank: participant.rank,
    },
    session: {
      title: liveSession.title,
      dayNumber: liveSession.dayNumber,
      sessionCode: liveSession.sessionCode,
      totalParticipants: liveSession.sessionResult?.totalParticipants ?? 0,
    },
    totalQuestions,
    percentage:
      totalQuestions > 0
        ? Math.round((participant.correctCount / totalQuestions) * 100)
        : 0,
  };
}

/** Participant join — sets guest_token cookie and redirects to /session/[code] */
export async function joinSessionAction(formData: FormData) {
  const code = (formData.get("code") as string | null)?.trim().toUpperCase() ?? "";
  const name = (formData.get("name") as string | null)?.trim() ?? "";

  if (!code || !name) throw new Error("MISSING_FIELDS");

  const result = await participantJoin(code, name);

  const cookieStore = await cookies();
  cookieStore.set("guest_token", result.token, {
    httpOnly: true,
    path: "/",
    maxAge: 12 * 60 * 60,
    sameSite: "strict",
  });

  redirect(`/session/${code}`);
}

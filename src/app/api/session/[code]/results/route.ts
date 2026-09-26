import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { code } = await params;

  const liveSession = await prisma.liveSession.findUnique({
    where: { sessionCode: code.trim().toUpperCase(), instructorId: session.user.id },
    include: {
      sessionResult: true,
      participants: {
        orderBy: [{ totalScore: "desc" }, { correctCount: "desc" }],
        select: {
          id: true,
          displayName: true,
          joinedAt: true,
          totalScore: true,
          answersCount: true,
          correctCount: true,
          rank: true,
          status: true,
        },
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

  if (!liveSession) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const totalQ = liveSession.sessionQuestions.length;

  const participants = liveSession.participants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    joinedAt: p.joinedAt,
    totalScore: Number(p.totalScore),
    answersCount: p.answersCount,
    correctCount: p.correctCount,
    wrongCount: p.answersCount - p.correctCount,
    rank: p.rank,
    status: p.status,
    percentage: totalQ > 0 ? Math.round((p.correctCount / totalQ) * 100) : 0,
  }));

  const questions = liveSession.sessionQuestions.map((sq) => ({
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

  const sr = liveSession.sessionResult;
  const statistics = sr
    ? {
        totalParticipants: sr.totalParticipants,
        totalQuestions: sr.totalQuestions,
        totalAnswers: sr.totalAnswers,
        totalCorrect: sr.totalCorrect,
        correctRate: Number(sr.correctRate),
        averageScore: Number(sr.averageScore),
        highestScore: Number(sr.highestScore),
      }
    : null;

  return NextResponse.json({
    sessionCode: liveSession.sessionCode,
    title: liveSession.title,
    dayNumber: liveSession.dayNumber,
    status: liveSession.status,
    participants,
    statistics,
    leaderboard: participants.slice(0, 10),
    questions,
  });
}

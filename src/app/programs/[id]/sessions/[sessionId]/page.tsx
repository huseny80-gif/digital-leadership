import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  getSessionDetails,
  startLiveSession,
  pauseLiveSession,
  resumeLiveSession,
  endLiveSession,
  showLiveQuestion,
  closeLiveQuestion,
  showQuestionResults,
  getNextQuestion,
  getSessionLeaderboard,
  getSessionQuestionsAction,
  getSessionResults,
} from "@/app/actions/sessions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  DRAFT:  "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-orange-100 text-orange-800",
  ENDED:  "bg-gray-100 text-gray-600",
};

const SQ_STATUS_COLOR: Record<string, string> = {
  DRAFT:   "bg-gray-100 text-gray-500",
  READY:   "bg-blue-100 text-blue-700",
  LIVE:    "bg-green-100 text-green-700",
  CLOSED:  "bg-orange-100 text-orange-700",
  RESULTS: "bg-purple-100 text-purple-700",
};

export default async function InstructorSessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;

  const authSession = await auth();
  if (!authSession?.user?.id) redirect("/login");

  let session;
  try {
    session = await getSessionDetails(sessionId);
  } catch {
    notFound();
  }

  if (session.programId !== id) notFound();

  const questions = await getSessionQuestionsAction(sessionId);

  const currentSQ = session.currentQuestionId
    ? questions.find((q) => q.id === session.currentQuestionId) ?? null
    : null;

  const leaderboard =
    session.status === "ENDED" ? await getSessionLeaderboard(sessionId) : null;

  const analyticsData =
    session.status === "ENDED" ? await getSessionResults(sessionId) : null;

  const nextQ =
    session.status === "ACTIVE" && (!currentSQ || currentSQ.status === "CLOSED" || currentSQ.status === "RESULTS")
      ? await getNextQuestion(sessionId)
      : null;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/programs/${id}`} className="text-sm text-gray-500 hover:text-gray-800">
            ← Program
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="font-bold truncate">{session.title}</h1>
        </div>

        {/* Session info */}
        <div className="bg-white rounded-2xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${STATUS_COLOR[session.status]}`}>
              {session.status}
            </span>
            <span className="text-sm text-gray-500">
              {session._count.participants} participant{session._count.participants !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Session code */}
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Participants join at <strong>/join</strong> with code:</p>
            <p className="text-4xl font-mono font-bold tracking-widest text-blue-700">{session.sessionCode}</p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-2">
            {session.status === "DRAFT" && (
              <form action={async () => {
                "use server";
                await startLiveSession(sessionId);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  ▶ Start Session
                </button>
              </form>
            )}

            {session.status === "ACTIVE" && nextQ && (
              <form action={async () => {
                "use server";
                await showLiveQuestion(sessionId, nextQ.id);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  ▶ Show Q{nextQ.questionOrder}
                </button>
              </form>
            )}

            {session.status === "ACTIVE" && currentSQ?.status === "LIVE" && (
              <form action={async () => {
                "use server";
                await closeLiveQuestion(sessionId, currentSQ.id);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">
                  ■ Close Question
                </button>
              </form>
            )}

            {session.status === "ACTIVE" && currentSQ?.status === "CLOSED" && (
              <form action={async () => {
                "use server";
                await showQuestionResults(sessionId, currentSQ.id);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
                  Show Results
                </button>
              </form>
            )}

            {session.status === "ACTIVE" && (
              <form action={async () => {
                "use server";
                await pauseLiveSession(sessionId);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                  ⏸ Pause
                </button>
              </form>
            )}

            {session.status === "PAUSED" && (
              <form action={async () => {
                "use server";
                await resumeLiveSession(sessionId);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  ▶ Resume
                </button>
              </form>
            )}

            {(session.status === "ACTIVE" || session.status === "PAUSED") && (
              <form action={async () => {
                "use server";
                await endLiveSession(sessionId);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100">
                  End Session
                </button>
              </form>
            )}

            <form action={async () => {
              "use server";
              redirect(`/programs/${id}/sessions/${sessionId}`);
            }}>
              <button type="submit" className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                ↻ Refresh
              </button>
            </form>
          </div>
        </div>

        {/* Current question */}
        {currentSQ && (
          <div className="bg-white rounded-2xl border p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Current Question — Q{currentSQ.questionOrder}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${SQ_STATUS_COLOR[currentSQ.status]}`}>
                {currentSQ.status}
              </span>
            </div>
            <p className="text-gray-700">{currentSQ.question.questionText}</p>
          </div>
        )}

        {/* All questions list */}
        <div className="bg-white rounded-2xl border p-6">
          <h2 className="font-semibold mb-4">Questions ({questions.length})</h2>
          <div className="space-y-2">
            {questions.map((sq) => (
              <div key={sq.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                <span className="font-mono text-gray-400 w-8">Q{sq.questionOrder}</span>
                <span className="flex-1 text-gray-700 truncate mx-2">{sq.question.questionText}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${SQ_STATUS_COLOR[sq.status]}`}>
                  {sq.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Live Session Analytics (only when ENDED) ── */}
        {analyticsData && (
          <div className="bg-white rounded-2xl border p-6 space-y-6">
            <h2 className="text-lg font-bold">Live Session Analytics</h2>

            {/* Stats cards */}
            {analyticsData.statistics && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{analyticsData.statistics.totalParticipants}</p>
                  <p className="text-xs text-blue-500 mt-1">Total Participants</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {analyticsData.participants.filter((p) => p.answersCount > 0).length}
                  </p>
                  <p className="text-xs text-green-500 mt-1">Completed</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">
                    {analyticsData.statistics.totalParticipants > 0
                      ? Math.round(
                          (analyticsData.participants.filter((p) => p.answersCount > 0).length /
                            analyticsData.statistics.totalParticipants) *
                            100
                        )
                      : 0}%
                  </p>
                  <p className="text-xs text-purple-500 mt-1">Participation Rate</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-orange-700">
                    {Math.round(analyticsData.statistics.averageScore)}
                  </p>
                  <p className="text-xs text-orange-500 mt-1">Average Score</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{analyticsData.statistics.highestScore}</p>
                  <p className="text-xs text-yellow-500 mt-1">Highest Score</p>
                </div>
              </div>
            )}

            {/* Top Performers */}
            {analyticsData.participants.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Top Performers</h3>
                <div className="flex gap-3 flex-wrap">
                  {analyticsData.participants.slice(0, 3).map((p, i) => {
                    const medals = ["🥇", "🥈", "🥉"];
                    const colors = [
                      "border-yellow-200 bg-yellow-50",
                      "border-gray-200 bg-gray-50",
                      "border-orange-200 bg-orange-50",
                    ];
                    return (
                      <div
                        key={p.id}
                        className={`flex-1 min-w-[130px] rounded-xl border ${colors[i]} p-4 text-center`}
                      >
                        <div className="text-3xl mb-1">{medals[i]}</div>
                        <p className="font-bold text-sm truncate">{p.displayName}</p>
                        <p className="text-lg font-bold mt-1">{p.totalScore} pts</p>
                        <p className="text-xs text-gray-500">{p.percentage}% accuracy</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Participant table */}
            {analyticsData.participants.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">All Participants</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-gray-400">
                        <th className="pb-2 pr-2 font-normal">#</th>
                        <th className="pb-2 pr-3 font-normal">Name</th>
                        <th className="pb-2 pr-3 text-right font-normal">Answered</th>
                        <th className="pb-2 pr-3 text-right font-normal">Correct</th>
                        <th className="pb-2 pr-3 text-right font-normal">Wrong</th>
                        <th className="pb-2 pr-3 text-right font-normal">Score</th>
                        <th className="pb-2 text-right font-normal">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData.participants.map((p) => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 pr-2 font-mono text-gray-400">{p.rank ?? "—"}</td>
                          <td className="py-2 pr-3 font-medium">{p.displayName}</td>
                          <td className="py-2 pr-3 text-right text-gray-500">{p.answersCount}</td>
                          <td className="py-2 pr-3 text-right text-green-600 font-medium">{p.correctCount}</td>
                          <td className="py-2 pr-3 text-right text-red-500">{p.wrongCount}</td>
                          <td className="py-2 pr-3 text-right font-bold text-blue-700">{p.totalScore}</td>
                          <td className="py-2 text-right text-gray-500">{p.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Question Analytics */}
            {analyticsData.questions.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Question Analytics</h3>
                <div className="space-y-3">
                  {analyticsData.questions.map((q) => (
                    <div key={q.sessionQuestionId} className="border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="font-mono font-bold text-gray-400 text-sm flex-shrink-0">
                            Q{q.questionOrder}
                          </span>
                          <p className="text-sm text-gray-700 line-clamp-2">{q.questionText}</p>
                        </div>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            q.accuracy >= 70
                              ? "bg-green-100 text-green-700"
                              : q.accuracy >= 40
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {q.accuracy}%
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Answered: {q.totalAnswers}</span>
                        <span className="text-green-600">Correct: {q.correctAnswers}</span>
                        <span className="text-red-500">Wrong: {q.totalAnswers - q.correctAnswers}</span>
                      </div>
                      {q.totalAnswers > 0 && (
                        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              q.accuracy >= 70
                                ? "bg-green-500"
                                : q.accuracy >= 40
                                ? "bg-yellow-400"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${q.accuracy}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard (only when session ended) */}
        {leaderboard && leaderboard.length > 0 && (
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold mb-4">Final Leaderboard</h2>
            <div className="space-y-2">
              {leaderboard.map((entry) => (
                <div key={entry.participantId} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                  <span className="w-8 font-mono font-bold text-gray-400">#{entry.rank}</span>
                  <span className="flex-1 font-medium">{entry.displayName}</span>
                  <span className="text-gray-500 text-xs mr-3">{entry.correctCount}/{entry.answersCount} correct</span>
                  <span className="font-bold text-blue-700">{entry.totalScore} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

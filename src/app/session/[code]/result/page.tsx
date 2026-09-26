import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getParticipantResult } from "@/app/actions/sessions";

export default async function ParticipantResultPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get("guest_token")?.value;

  if (!token) redirect("/join");

  let result;
  try {
    result = await getParticipantResult(code, token);
  } catch {
    redirect("/join");
  }

  const { participant, session, totalQuestions, percentage } = result;

  const rankEmoji =
    participant.rank === 1 ? "🥇" : participant.rank === 2 ? "🥈" : participant.rank === 3 ? "🥉" : "🎖️";

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl border p-6 text-center space-y-2">
          <div className="text-5xl">🏁</div>
          <h1 className="text-xl font-bold">{session.title ?? `Day ${session.dayNumber}`}</h1>
          <p className="text-sm text-gray-500">
            Session Code:{" "}
            <span className="font-mono font-bold tracking-widest">{session.sessionCode}</span>
          </p>
        </div>

        {/* Participant name */}
        <div className="bg-white rounded-2xl border p-5 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Participant</p>
          <p className="text-2xl font-bold">{participant.displayName}</p>
        </div>

        {/* Score + Accuracy */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5 text-center">
            <p className="text-xs text-blue-500 uppercase tracking-wide mb-1">Score</p>
            <p className="text-4xl font-bold text-blue-700">{participant.totalScore}</p>
            <p className="text-xs text-blue-400 mt-1">points</p>
          </div>
          <div className="bg-green-50 rounded-2xl border border-green-100 p-5 text-center">
            <p className="text-xs text-green-500 uppercase tracking-wide mb-1">Accuracy</p>
            <p className="text-4xl font-bold text-green-700">{percentage}%</p>
          </div>
        </div>

        {/* Q breakdown */}
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-4 text-center">Questions</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold">{totalQuestions}</p>
              <p className="text-xs text-gray-500 mt-1">Total</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600">{participant.correctCount}</p>
              <p className="text-xs text-gray-500 mt-1">Correct</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-red-500">{participant.wrongCount}</p>
              <p className="text-xs text-gray-500 mt-1">Wrong</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Rank */}
        {participant.rank && session.totalParticipants > 0 && (
          <div className="bg-yellow-50 rounded-2xl border border-yellow-100 p-5 text-center">
            <p className="text-xs text-yellow-500 uppercase tracking-wide mb-2">Your Rank</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl">{rankEmoji}</span>
              <p className="text-4xl font-bold text-yellow-700">
                #{participant.rank}
                <span className="text-xl font-medium text-yellow-500">
                  {" "}/ {session.totalParticipants}
                </span>
              </p>
            </div>
          </div>
        )}

        <Link
          href="/join"
          className="block text-center text-sm text-gray-400 hover:text-gray-600 pt-2"
        >
          ← Back to Join
        </Link>
      </div>
    </main>
  );
}

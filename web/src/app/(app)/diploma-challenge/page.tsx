import type { Metadata } from "next";

export const metadata: Metadata = { title: "تحدي الدبلوم" };

/**
 * «تحدي الدبلوم» — the standalone «من سيربح الدبلوم» game
 * (public/diploma-challenge.html, canonical copy at the repo root) shown
 * inside the platform shell so the sidebar stays visible. The game keeps
 * its own colours, sounds and effects and saves progress in the
 * learner's browser (localStorage, same origin).
 */
export default function DiplomaChallengePage() {
  return (
    <section className="diploma-challenge-page" dir="rtl">
      <iframe
        src="/diploma-challenge.html"
        title="تحدي الدبلوم — من سيربح الدبلوم"
        className="diploma-challenge-frame"
        allow="autoplay; fullscreen"
      />
    </section>
  );
}

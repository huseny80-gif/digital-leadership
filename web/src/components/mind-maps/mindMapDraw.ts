/**
 * "Draw on click" for the mind-map canvas: links draw themselves from their
 * parent (stroke-dashoffset on a pathLength="1" path) with a glowing pen at
 * the tip, each node's gold frame traces its border, its glass fills, then its
 * label appears word by word (whole words keep Arabic letters joined).
 * Everything runs on the Web Animations API so React never re-renders mid-draw.
 */
export interface DrawTree { id: string; children: DrawTree[] }

/** Pace multiplier: 1.5 slows the whole scene (about 4.5 s) so each stroke can be followed. */
const PACE = 1.5;
const ms = (value: number) => value * PACE;
const FRAME = ms(380), LINK = ms(520), WORD = ms(55), FILL = ms(360), EASE_DRAW = "cubic-bezier(.2,.7,.3,1)";
const stagger = (depth: number) => ms(depth === 0 ? 140 : depth === 1 ? 110 : 70);

export function drawingDisabled(): boolean {
  return typeof window === "undefined" || typeof Element.prototype.animate !== "function"
    || (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

/** Plays the drawing for `tree` inside `world`; returns the started animations so a click can finish them. */
export function drawMindMap(world: HTMLElement, pens: HTMLElement, tree: DrawTree, includeSelf: boolean): Animation[] {
  const animations: Animation[] = [];
  const node = (id: string) => world.querySelector<HTMLElement>(`[data-at="${CSS.escape(id)}"]`);
  const link = (id: string) => world.querySelector<SVGPathElement>(`path[data-to="${CSS.escape(id)}"]`);
  const run = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => animations.push(element.animate(keyframes, { fill: "backwards", ...options }));
  pens.replaceChildren();

  (function walk(item: DrawTree, start: number, depth: number) {
    const box = node(item.id);
    if (!box) return;
    if (start >= 0) {
      const frame = box.querySelector("rect"), button = box.querySelector<HTMLElement>("button");
      if (frame) run(frame, [{ opacity: 1, strokeDashoffset: 1 }, { opacity: 1, strokeDashoffset: 0, offset: .7 }, { opacity: 0, strokeDashoffset: 0 }], { duration: FRAME + ms(450), delay: start, easing: "ease-out" });
      if (button) run(button, [{ opacity: 0 }, { opacity: 1 }], { duration: FILL, delay: start + FRAME * .7, easing: "ease-in-out" });
      box.querySelectorAll("[data-word]").forEach((word, index) => run(word, [{ opacity: 0, transform: "translateX(8px)" }, { opacity: 1, transform: "none" }], { duration: ms(350), delay: start + FRAME * .8 + index * WORD, easing: "ease-out" }));
    }
    const filled = start + FRAME;
    item.children.forEach((child, index) => {
      const begin = filled + index * stagger(depth), path = link(child.id);
      if (path) {
        run(path, [{ strokeDashoffset: 1, stroke: "#E9C46A" }, { strokeDashoffset: 0, stroke: "#E9C46A", offset: .85 }, { strokeDashoffset: 0 }], { duration: LINK + ms(300), delay: begin, easing: EASE_DRAW });
        const pen = window.document.createElement("span");
        pen.dataset.pen = ""; pen.style.offsetPath = `path("${path.getAttribute("d")}")`;
        pens.append(pen);
        run(pen, [{ offsetDistance: "0%", opacity: 0 }, { offsetDistance: "2%", opacity: 1, offset: .02 }, { offsetDistance: "100%", opacity: 1, offset: .85 }, { offsetDistance: "100%", opacity: 0 }], { duration: LINK + ms(160), delay: begin, easing: EASE_DRAW, fill: "both" });
      }
      walk(child, begin + LINK, depth + 1);
    });
  })(tree, includeSelf ? 0 : -FRAME, 0);

  void Promise.all(animations.map(animation => animation.finished)).then(() => pens.replaceChildren(), () => undefined);
  return animations;
}

export function finishDrawing(animations: Animation[]): void {
  for (const animation of animations) { try { animation.finish(); } catch { /* infinite or detached */ } }
}

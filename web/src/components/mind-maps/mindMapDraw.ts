/**
 * "Draw on click" for the mind-map canvas: links draw themselves from their
 * parent (stroke-dashoffset on a pathLength="1" path) with a glowing pen at
 * the tip, each node's gold frame traces its border, its glass fills, then its
 * label appears word by word (whole words keep Arabic letters joined).
 * Everything runs on the Web Animations API so React never re-renders mid-draw.
 */
export interface DrawTree { id: string; children: DrawTree[] }

/** Pace multiplier: 5/3 sets the whole scene to about 5 s so each stroke can be followed. */
const PACE = 5 / 3;
export const ms = (value: number) => value * PACE;
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

/**
 * The same drawing language for flow layouts (concept map, sequence diagram).
 * Elements opt in with `data-draw`, in document order:
 *   "card"  gold frame traces the border, the glass fills, then [data-word] children appear
 *   "pop"   a marker or arrow scales in
 *   "fade"  a caption fades in
 *   "line"  a rule draws along its long axis (RTL: from the right; vertical: from the top), glowing gold
 *   "track" a rule that draws alongside everything after it (a timeline spine)
 *   "path"  an SVG path with pathLength="1" draws itself
 */
export function drawFlow(container: HTMLElement): Animation[] {
  const animations: Animation[] = [];
  const run = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => animations.push(element.animate(keyframes, { fill: "backwards", ...options }));
  const items = [...container.querySelectorAll<HTMLElement | SVGElement>("[data-draw]")];
  const advance: Record<string, number> = { card: FRAME * .9, pop: ms(160), fade: ms(160), line: LINK * .8, path: LINK * 1.4, track: 0 };
  const starts: number[] = [];
  let clock = 0;
  for (const item of items) { starts.push(clock); clock += advance[item.dataset.draw ?? ""] ?? 0; }
  // Keep long sequences watchable: compress the gaps, never the strokes themselves.
  const squeeze = clock > ms(4200) ? ms(4200) / clock : 1;
  const end = clock * squeeze;
  items.forEach((item, index) => {
    const start = starts[index]! * squeeze, kind = item.dataset.draw;
    if (kind === "card") {
      const width = (item as HTMLElement).offsetWidth, height = (item as HTMLElement).offsetHeight;
      if (width && height) {
        const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), rect = document.createElementNS(ns, "rect");
        svg.setAttribute("data-draw-frame", ""); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("width", String(width)); svg.setAttribute("height", String(height));
        const radius = parseFloat(getComputedStyle(item).borderTopLeftRadius) || 12;
        for (const [key, value] of Object.entries({ x: 1, y: 1, width: width - 2, height: height - 2, rx: radius, pathLength: 1 })) rect.setAttribute(key, String(value));
        svg.append(rect); item.append(svg);
        const trace = rect.animate([{ opacity: 1, strokeDashoffset: 1 }, { opacity: 1, strokeDashoffset: 0, offset: .7 }, { opacity: 0, strokeDashoffset: 0 }], { duration: FRAME + ms(450), delay: start, easing: "ease-out", fill: "both" });
        animations.push(trace); void trace.finished.then(() => svg.remove(), () => svg.remove());
      }
      run(item, [{ backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none", offset: 0 }], { duration: FILL, delay: start + FRAME * .7, easing: "ease-in-out" });
      const words = item.querySelectorAll("[data-word]");
      // Cards without word spans (e.g. a label with a <bdi> caption) reveal their content as one block.
      if (!words.length) [...item.children].filter(child => !child.hasAttribute("data-draw-frame")).forEach(child => run(child, [{ opacity: 0 }, { opacity: 1 }], { duration: ms(350), delay: start + FRAME * .8, easing: "ease-out" }));
      words.forEach((word, wordIndex) => run(word, [{ opacity: 0, transform: "translateX(8px)" }, { opacity: 1, transform: "none" }], { duration: ms(350), delay: start + FRAME * .8 + Math.min(wordIndex, 12) * WORD, easing: "ease-out" }));
    } else if (kind === "pop") run(item, [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1.15)", offset: .7 }, { opacity: 1, transform: "none" }], { duration: ms(320), delay: start, easing: "ease-out" });
    else if (kind === "fade") run(item, [{ opacity: 0 }, { opacity: 1 }], { duration: ms(400), delay: start, easing: "ease-out" });
    else if (kind === "path") run(item, [{ strokeDashoffset: 1, stroke: "#E9C46A" }, { strokeDashoffset: 0, stroke: "#E9C46A", offset: .85 }, { strokeDashoffset: 0 }], { duration: LINK * 1.6, delay: start, easing: EASE_DRAW });
    else if (kind === "line" || kind === "track") {
      const box = item as HTMLElement, vertical = box.offsetHeight > box.offsetWidth;
      const scale = vertical ? "scaleY(0)" : "scaleX(0)", origin = vertical ? "top" : box.dataset.origin === "center" ? "center" : "right";
      box.style.transformOrigin = origin;
      const duration = kind === "track" ? Math.max(end - start, LINK) : LINK;
      run(box, [{ transform: scale, backgroundColor: "#E9C46A", boxShadow: "0 0 10px rgba(233,196,106,.6)" }, { transform: "none", backgroundColor: "#E9C46A", boxShadow: "0 0 10px rgba(233,196,106,.6)", offset: .9 }, { transform: "none" }], { duration, delay: start, easing: kind === "track" ? "linear" : EASE_DRAW });
    }
  });
  return animations;
}

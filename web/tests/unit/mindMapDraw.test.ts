import { afterEach, describe, expect, it, vi } from "vitest";
import { drawMindMap } from "@/components/mind-maps/mindMapDraw";

/** jsdom has no Web Animations API; record each call's target and delay instead. */
function stage() {
  const world = document.createElement("div"), pens = document.createElement("div");
  world.innerHTML = `<div data-at="root"><svg><rect/></svg><button><span data-word>المحاضرة</span> <span data-word>الثانية</span></button></div>
    <svg><path data-to="s1" d="M0,0 L10,10"/><path data-to="s2" d="M0,0 L10,20"/><path data-to="p1" d="M0,0 L5,5"/></svg>
    <div data-at="s1"><svg><rect/></svg><button><span data-word>أولًا</span></button></div>
    <div data-at="s2"><svg><rect/></svg><button><span data-word>ثانيًا</span></button></div>
    <div data-at="p1"><svg><rect/></svg><button><span data-word>مفهوم</span></button></div>`;
  return { world, pens };
}
const calls: Array<{ target: Element; delay: number }> = [];
afterEach(() => { calls.length = 0; vi.restoreAllMocks(); });
function mockAnimate() {
  Element.prototype.animate = vi.fn(function (this: Element, _frames: Keyframe[], options?: number | KeyframeAnimationOptions) {
    calls.push({ target: this, delay: typeof options === "object" ? Number(options.delay ?? 0) : 0 });
    return { finished: Promise.resolve(), finish() {}, playState: "finished", pending: false } as unknown as Animation;
  }) as unknown as Element["animate"];
}

describe("mind-map draw-on-click sequence", () => {
  it("draws parent before its links, links in order, and each child only after its link", () => {
    mockAnimate(); const { world, pens } = stage();
    drawMindMap(world, pens, { id: "root", children: [{ id: "s1", children: [{ id: "p1", children: [] }] }, { id: "s2", children: [] }] }, true);
    const at = (selector: string) => calls.filter(call => call.target.matches(selector)).map(call => call.delay);
    const [rootFrame] = at('[data-at="root"] rect'), [link1] = at('[data-to="s1"]'), [link2] = at('[data-to="s2"]'), [linkP] = at('[data-to="p1"]');
    expect(rootFrame).toBe(0);
    expect(link1).toBeGreaterThan(rootFrame!); expect(link2).toBeGreaterThan(link1!);
    expect(at('[data-at="s1"] rect')[0]).toBeGreaterThan(link1!); expect(linkP).toBeGreaterThan(at('[data-at="s1"] rect')[0]!);
    const words = at('[data-at="root"] [data-word]'); expect(words[1]).toBeGreaterThan(words[0]!);
    expect(pens.children).toHaveLength(3);
  });
  it("draws only a branch's own links and children when a section opens", () => {
    mockAnimate(); const { world, pens } = stage();
    drawMindMap(world, pens, { id: "s1", children: [{ id: "p1", children: [] }] }, false);
    expect(calls.some(call => call.target.closest('[data-at="s1"]'))).toBe(false);
    expect(calls.some(call => call.target.matches('[data-to="p1"]'))).toBe(true);
    expect(calls.some(call => call.target.closest('[data-at="root"]'))).toBe(false);
  });
});

describe("flow drawing for the concept map and sequence diagram", () => {
  it("draws markers and cards in document order, words one by one, and blocks without words as a whole", async () => {
    mockAnimate();
    const { drawFlow } = await import("@/components/mind-maps/mindMapDraw");
    const box = document.createElement("div");
    box.innerHTML = `<span data-draw="track" id="t"></span><span data-draw="pop" id="m1"></span><button data-draw="card" id="c1"><span data-word>أولًا</span> <span data-word>التعريف</span></button><span data-draw="pop" id="m2"></span><button data-draw="card" id="c2"><b>بلا كلمات</b></button>`;
    drawFlow(box);
    const first = (id: string) => calls.find(call => call.target.id === id)?.delay ?? -1;
    expect(first("m1")).toBeLessThan(first("c1")); expect(first("c1")).toBeLessThan(first("m2")); expect(first("m2")).toBeLessThan(first("c2"));
    const words = calls.filter(call => call.target.matches("#c1 [data-word]")).map(call => call.delay);
    expect(words).toHaveLength(2); expect(words[1]).toBeGreaterThan(words[0]!);
    expect(calls.some(call => call.target.matches("#c2 > b"))).toBe(true);
  });
});

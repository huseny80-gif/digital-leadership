import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve(process.cwd(), "..", "summaries.html"), "utf8");
const script = html.match(/<script id="summaries-script">([\s\S]*?)<\/script>/)![1];
const baseManifest = JSON.parse(readFileSync(resolve(process.cwd(), "..", "assets/audio/manifest.json"), "utf8"));
const keys = ["msa-male", "msa-female", "iraqi-male", "iraqi-female", "saudi-male", "saudi-female"];

type Recording = { path: string; available: boolean; transcript?: string };
type Manifest = { lectures: Array<{ id: string; recordings: Record<string, Recording> }> };

function availableManifest(): Manifest {
  const manifest = structuredClone(baseManifest);
  for (const lecture of manifest.lectures) {
    for (const key of keys) {
      lecture.recordings[key].available = true;
      lecture.recordings[key].transcript = `assets/audio/${lecture.id}/${key.split("-")[0]}.txt`;
    }
  }
  return manifest;
}

async function render(manifest: Manifest) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => manifest }));
  document.documentElement.innerHTML = html.match(/<html[^>]*>([\s\S]*)<\/html>/)![1];
  window.eval(script);
  await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>("#refresh-recordings")!.disabled).toBe(false));
  await new Promise(resolve => queueMicrotask(() => resolve(undefined)));
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
    if (this.querySelector("source")) {
      Object.defineProperty(this, "duration", { value: 300, configurable: true });
      queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.innerHTML = "";
  localStorage.clear();
});

describe("published summary audio choices", () => {
  it("maps all five lectures and six voice choices to the right MP3 and spoken text", async () => {
    await render(availableManifest());
    expect(document.querySelectorAll(".player")).toHaveLength(5);
    expect(document.querySelector("#recording-count")!.textContent).toContain("٣٠ من ٣٠");
    for (const lecture of baseManifest.lectures) {
      const card = document.getElementById(lecture.id)!;
      const select = card.querySelector<HTMLSelectElement>(`#voice-${lecture.id}`)!;
      expect(select.options).toHaveLength(6);
      for (const key of keys) {
        select.value = key;
        select.dispatchEvent(new Event("change"));
        await new Promise(resolve => queueMicrotask(() => resolve(undefined)));
        const audio = card.querySelector<HTMLAudioElement>("audio")!;
        expect(audio.querySelector("source")!.getAttribute("src")).toBe(`assets/audio/${lecture.id}/${key}.mp3`);
        expect(audio.autoplay).toBe(false);
        expect(card.querySelector(".transcript-link")!.getAttribute("href")).toBe(`assets/audio/${lecture.id}/${key.split("-")[0]}.txt`);
        expect(card.querySelector(".download-audio")!.getAttribute("href")).toBe(`assets/audio/${lecture.id}/${key}.mp3`);
      }
    }
  });

  it("does not request a missing recording and keeps the original transcript fallback", async () => {
    const manifest = availableManifest();
    manifest.lectures[0].recordings["msa-male"].available = false;
    await render(manifest);
    const card = document.getElementById(manifest.lectures[0].id)!;
    expect(card.querySelector("source")).toBeNull();
    expect(card.querySelector(".audio-status")!.textContent).toContain("لم يُنشر تسجيل");
    expect(card.querySelector(".transcript-link")!.getAttribute("href")).toBe(`assets/audio/${manifest.lectures[0].id}/summary.txt`);
  });

  it("rejects a cross-lecture recording path instead of silently selecting it", async () => {
    const manifest = availableManifest();
    manifest.lectures[0].recordings["msa-male"].path = "assets/audio/innovation-05/msa-male.mp3";
    await render(manifest);
    expect(document.querySelectorAll("audio source")).toHaveLength(0);
    expect(document.querySelector("#recording-count")!.textContent).toContain("تعذّر");
    expect(document.querySelector("#manifest-status")!.classList.contains("error-text")).toBe(true);
  });
});

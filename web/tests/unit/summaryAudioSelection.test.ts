import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve(process.cwd(), "..", "summaries.html"), "utf8");
const script = html.match(/<script id="summaries-script">([\s\S]*?)<\/script>/)![1];
const baseManifest = JSON.parse(readFileSync(resolve(process.cwd(), "..", "assets/audio/manifest.json"), "utf8"));
const keys = ["msa-male", "msa-female", "iraqi-male", "iraqi-female", "saudi-male", "saudi-female"];
const subjects = {
  ai: "2d6c0980-e4d2-4687-9027-cf090b3d1a67",
  cybersecurity: "bc861a76-620d-4646-81ca-c49d24665b75",
  innovation: "7eb2b714-570f-4ed0-a00e-10efec7a20e5",
  legal: "ade09563-02ec-4a09-a97b-58857f6cd876",
  risk: "1f4d2071-d1c9-46ee-a848-d5c90eedf287",
} as const;

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
async function render(manifest: Manifest, subjectId?: string, hash = "") {
  const query = subjectId ? `?subject=${subjectId}` : "";
  window.history.replaceState(null, "", `/summaries.html${query}${hash}`);
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
  it("defaults to Innovation, preserves the old hash, and maps all five lectures to six voices", async () => {
    await render(availableManifest(), undefined, "#innovation-03");
    expect(document.querySelectorAll(".player")).toHaveLength(5);
    expect(document.querySelector<HTMLSelectElement>("#subject-select")!.value).toBe(subjects.innovation);
    expect(document.querySelector("#course-heading")!.textContent).toBe("الابتكار وإدارة المشاريع");
    expect(document.querySelector("#recording-count")!.textContent).toContain("٣٠ من ٣٠");
    expect(document.getElementById("innovation-03")).toHaveProperty("open", true);
    for (const lecture of baseManifest.lectures.filter((item: { subjectId: string }) => item.subjectId === subjects.innovation)) {
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

  it.each([
    [subjects.ai, 6],
    [subjects.cybersecurity, 7],
    [subjects.innovation, 5],
    [subjects.legal, 8],
    [subjects.risk, 6],
  ] as const)("filters the selected subject to %s lectures", async (subjectId, count) => {
    await render(availableManifest(), subjectId);
    expect(document.querySelector<HTMLSelectElement>("#subject-select")!.options).toHaveLength(5);
    expect(document.querySelectorAll(".lecture-card")).toHaveLength(count);
    expect(document.querySelectorAll(".player")).toHaveLength(count);
    expect(document.querySelector("#lecture-count")!.textContent).toBe(new Intl.NumberFormat("ar-IQ").format(count));
    expect(document.querySelector("#recording-count")!.textContent).toContain(`${new Intl.NumberFormat("ar-IQ").format(count * 6)} من`);
  });

  it("updates the subject query and identity without exposing an unauthorized subject", async () => {
    await render(availableManifest());
    const select = document.querySelector<HTMLSelectElement>("#subject-select")!;
    select.value = subjects.risk;
    select.dispatchEvent(new Event("change"));
    await new Promise(resolve => queueMicrotask(() => resolve(undefined)));
    expect(window.location.search).toBe(`?subject=${subjects.risk}`);
    expect(document.querySelectorAll(".lecture-card")).toHaveLength(6);
    expect(document.querySelector("#platform-link")!.getAttribute("href")).toContain(`/subjects/${subjects.risk}`);
    expect(document.title).toContain("إدارة المخاطر");
  });

  it("shows an Arabic error and no lectures for an unknown UUID", async () => {
    await render(availableManifest(), "00000000-0000-0000-0000-000000000000");
    expect(document.querySelector("#subject-error")!.textContent).toContain("غير متاحة أو غير مصرح بها");
    expect(document.querySelectorAll(".lecture-card")).toHaveLength(0);
    expect(document.querySelector("#lecture-index")!.hasAttribute("hidden")).toBe(true);
  });

  it("recovers from an unknown UUID when the user chooses an allowed subject", async () => {
    await render(availableManifest(), "00000000-0000-0000-0000-000000000000");
    const select = document.querySelector<HTMLSelectElement>("#subject-select")!;
    select.value = subjects.risk;
    select.dispatchEvent(new Event("change"));
    await new Promise(resolve => queueMicrotask(() => resolve(undefined)));
    expect(document.querySelector("#subject-error")!.hasAttribute("hidden")).toBe(true);
    expect(document.querySelectorAll(".lecture-card")).toHaveLength(6);
  });

  it("does not request a missing recording and keeps the original transcript fallback", async () => {
    const manifest = availableManifest();
    const innovation = manifest.lectures.find(item => item.id === "innovation-01")!;
    innovation.recordings["msa-male"].available = false;
    await render(manifest);
    const card = document.getElementById(innovation.id)!;
    expect(card.querySelector("source")).toBeNull();
    expect(card.querySelector(".audio-status")!.textContent).toContain("لم يُنشر تسجيل");
    expect(card.querySelector(".transcript-link")!.getAttribute("href")).toBe(`assets/audio/${innovation.id}/summary.txt`);
  });

  it("rejects a cross-lecture recording path while validating the global manifest", async () => {
    const manifest = availableManifest();
    manifest.lectures.find(item => item.id === "innovation-01")!.recordings["msa-male"].path = "assets/audio/innovation-05/msa-male.mp3";
    await render(manifest);
    expect(document.querySelectorAll("audio source")).toHaveLength(0);
    expect(document.querySelector("#recording-count")!.textContent).toContain("تعذّر");
    expect(document.querySelector("#manifest-status")!.classList.contains("error-text")).toBe(true);
  });
});

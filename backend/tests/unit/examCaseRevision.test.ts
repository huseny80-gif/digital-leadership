import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { refreshDiverseAssessments } from "../../src/examMaterials/refreshDiverseAssessments.js";
import { diverseAssessmentPolicy } from "../../src/examMaterials/diverseAssessment.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("../../src/examMaterials/examMaterialService.js", () => ({ ExamMaterialService: class { generate = generate; } }));
const subject = "bc861a76-620d-4646-81ca-c49d24665b75";
const revision = "reviewed-comparison-cases";
const requestId = (ids: string[]) => finquizRecordId(`${diverseAssessmentPolicy}:selection:${subject}:${[...new Set(ids)].sort().join(":")}:source-revision:${revision}`);
const selection = (extra = {}) => ({ id: "saved", subject_id: subject, lecture_ids: ["lecture-2", "lecture-1"], created_by: "admin", request_id: "earlier-request",
  summary: { grounding: { questionPolicy: diverseAssessmentPolicy, sourceScope: "catalog-primary" } }, ...extra });
function database(rows: ReturnType<typeof selection>[], alreadyExists = false) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("select g.id")) return { rows, rowCount: rows.length };
    if (sql.startsWith("select s.id")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("select 1 from exam_material_groups")) return { rows: alreadyExists ? [{}] : [], rowCount: alreadyExists ? 1 : 0 };
    throw new Error("unexpected_query");
  });
  return { pool: { query } as unknown as Pool, query };
}
beforeEach(() => { generate.mockReset(); generate.mockResolvedValue({ id: "fresh-revision", questionCount: 24 }); });
describe("new reviewed cases refresh saved exam selections", () => {
  it("publishes a new edition even when the six-format policy has not changed", async () => {
    const row = selection(), before = structuredClone(row), db = database([row]);
    const result = await refreshDiverseAssessments(db.pool, revision);
    expect(result).toMatchObject({ sourceRevision: revision, published: 1, alreadyCurrent: 0, issues: [] });
    expect(generate).toHaveBeenCalledWith(subject, row.lecture_ids, requestId(row.lecture_ids), "admin", "catalog");
    expect(row).toEqual(before);
    expect(db.query.mock.calls.every(([sql]) => sql.startsWith("select"))).toBe(true);
  });
  it("keeps repeated starts and changed selection order idempotent", async () => {
    const row = selection({ request_id: requestId(["lecture-1", "lecture-2"]) });
    expect(await refreshDiverseAssessments(database([row]).pool, revision)).toMatchObject({ published: 0, alreadyCurrent: 1 });
    expect(generate).not.toHaveBeenCalled();
  });
  it("preserves a newer manually created revision after the source revision was already published", async () => {
    const row = selection({ id: "newer-manual-review" });
    expect(await refreshDiverseAssessments(database([row], true).pool, revision)).toMatchObject({ published: 0, alreadyCurrent: 1 });
    expect(generate).not.toHaveBeenCalled();
  });
  it("maintains the existing format-only refresh behavior when no source revision is supplied", async () => {
    expect(await refreshDiverseAssessments(database([selection()]).pool)).toMatchObject({ published: 0, alreadyCurrent: 1 });
    expect(generate).not.toHaveBeenCalled();
  });
});

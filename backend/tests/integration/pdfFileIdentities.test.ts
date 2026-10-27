import { createHash } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { repairPdfIdentities, pdfIdentityPolicy } from "../../src/files/repairPdfIdentities.js";
import { probePublishedPdfInventory } from "../../src/files/pdfInventoryProbe.js";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { catalogRoot, manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { readAsset } from "../../src/finquiz/assetFiles.js";
import { createFile, createLecture, createLectureItem, createUser } from "../helpers/seedFixtures.js";
import { passivePdf } from "../helpers/passivePdf.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const subjectId = subjectMapping["risk-management"]!;
const fullCourse = manifest.subjects.find(subject => subject.id === "risk-management")!;
// Lectures 4 and 5 were added after the pinned source review of the first three.
const source = { ...fullCourse, lectures: fullCourse.lectures.slice(0, 3) };
const bytes = new Map<string, Buffer>();
const read = vi.fn(async (key: string) => {
  const value = bytes.get(key);
  if (!value) throw new Error("private_storage_failure");
  return value;
});
const storage: StorageProvider = { name: "local-filesystem", read, upload: vi.fn(), delete: vi.fn(), getSignedUrl: vi.fn() };
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
  bytes.clear(); vi.clearAllMocks();
});
afterAll(async () => { await pool.end(); });

async function seed() {
  const actor = await createUser(pool, { email: "pdf-identity@example.test", providerSubject: "pdf-identity", roleName: "admin" });
  await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectId, source.title, actor]);
  return actor;
}

async function attach(actor: string, lecture: string, key: string, value: Buffer, checksum: string | null = null) {
  const fileId = await createFile(pool, { storageKey: key, uploadedBy: actor });
  bytes.set(key, value);
  await pool.query("update files set original_filename=$2,size_bytes=$3,checksum=$4 where id=$1", [fileId, "المحاضرة الأولى مخاطر.pdf", value.length, checksum]);
  await createLectureItem(pool, { lectureId: lecture, title: "المحاضرة الأولى مخاطر", itemType: "pdf", fileId, status: "published", createdBy: actor });
  return fileId;
}

describe("original PDF identity reconciliation", () => {
  it("repairs legacy metadata from the three real risk PDFs: six cards become three without altering any original or download identity", async () => {
    const actor = await seed(), files: string[] = [], lectures: string[] = [];
    for (const [index, lecture] of source.lectures.entries()) {
      const id = await createLecture(pool, { subjectId, title: lecture.title, orderIndex: lecture.number, status: "published", createdBy: actor });
      const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && lecture.files?.some(file => file.url === asset.path) && asset.filename.endsWith(".pdf"))!;
      files.push(await attach(actor, id, `private/risk-${index}.pdf`, await readAsset(asset, catalogRoot), [null, "old-import-checksum", ""][index]));
      lectures.push(id);
    }
    const snapshot = (await pool.query("select id,storage_key,original_filename,size_bytes,status from files order by id")).rows;
    const before = (await probePublishedPdfInventory(pool, [subjectId])).courses[0]!;
    expect(before).toMatchObject({ catalogFiles: 3, uploadedFiles: 3, unverifiedUploads: 3, cards: 6, duplicateCardsRemoved: 0 });
    expect(await repairPdfIdentities(pool, storage)).toMatchObject({ policy: pdfIdentityPolicy, candidates: 3, repaired: 3, issues: [] });
    const after = (await probePublishedPdfInventory(pool, [subjectId])).courses[0]!;
    expect(after).toMatchObject({ catalogFiles: 3, uploadedFiles: 3, unverifiedUploads: 0, cards: 3, duplicateCardsRemoved: 3 });
    expect(after.documents.map(document => document.lectureId)).toEqual(lectures);
    expect(after.documents.every(document => document.source === "catalog")).toBe(true);
    expect((await pool.query("select id,storage_key,original_filename,size_bytes,status from files order by id")).rows).toEqual(snapshot);
    expect((await pool.query("select count(*)::int n from audit_logs where action='file.content_identity_verified'")).rows[0]!.n).toBe(3);
    expect(await repairPdfIdentities(pool, storage)).toMatchObject({ candidates: 0, repaired: 0, issues: [] });
    expect(read).toHaveBeenCalledTimes(3);
    expect(storage.upload).not.toHaveBeenCalled(); expect(storage.delete).not.toHaveBeenCalled();
    expect((await pool.query("select count(*)::int n from lecture_items where file_id=any($1::uuid[]) and deleted_at is null", [files])).rows[0]!.n).toBe(3);
  });

  it("keeps a genuinely different PDF with the same Arabic filename, and never repairs hidden or already verified files", async () => {
    const actor = await seed();
    const lecture = await createLecture(pool, { subjectId, title: source.lectures[0]!.title, orderIndex: 1, status: "published", createdBy: actor });
    const alternate = passivePdf("a distinct instructor revision");
    const visible = await attach(actor, lecture, "private/alternate.pdf", alternate);
    const draft = await createLecture(pool, { subjectId, title: "محاضرة غير منشورة", status: "draft", createdBy: actor });
    const hidden = await attach(actor, draft, "private/hidden.pdf", alternate);
    const archived = await attach(actor, lecture, "private/archived.pdf", alternate);
    await pool.query("update files set status='archived' where id=$1", [archived]);
    const verified = await attach(actor, lecture, "private/verified.pdf", alternate, "a".repeat(64));
    expect(await repairPdfIdentities(pool, storage)).toMatchObject({ candidates: 1, repaired: 1, issues: [] });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("private/alternate.pdf");
    expect((await pool.query("select checksum from files where id=$1", [visible])).rows[0]!.checksum).toBe(createHash("sha256").update(alternate).digest("hex"));
    expect((await pool.query("select checksum from files where id=$1", [hidden])).rows[0]!.checksum).toBeNull();
    expect((await pool.query("select checksum from files where id=$1", [archived])).rows[0]!.checksum).toBeNull();
    expect((await pool.query("select checksum from files where id=$1", [verified])).rows[0]!.checksum).toBe("a".repeat(64));
    const result = (await probePublishedPdfInventory(pool, [subjectId])).courses[0]!;
    // The first lecture's original plus two different verified upload identities.
    expect(result.cards).toBe(3);
    expect(result.documents.some(document => document.fileId === visible)).toBe(true);
  });

  it("leaves failed reads, byte-length mismatches and a file changed during verification untouched", async () => {
    const actor = await seed();
    const lecture = await createLecture(pool, { subjectId, title: "فحص هوية الملف", status: "published", createdBy: actor });
    const original = passivePdf();
    const unreadable = await attach(actor, lecture, "private/unreadable.pdf", original);
    bytes.delete("private/unreadable.pdf");
    const mismatch = await attach(actor, lecture, "private/mismatch.pdf", original);
    await pool.query("update files set size_bytes=size_bytes+1 where id=$1", [mismatch]);
    const changed = await attach(actor, lecture, "private/changed.pdf", original);
    const racingStorage = { ...storage, read: async (key: string) => {
      if (key === "private/changed.pdf") await pool.query("update files set storage_key='private/replacement.pdf' where id=$1", [changed]);
      return read(key);
    } };
    const result = await repairPdfIdentities(pool, racingStorage);
    expect(result).toMatchObject({ candidates: 3, repaired: 0 });
    expect(result.issues).toEqual(expect.arrayContaining([
      { fileId: unreadable, code: "source_read_failed" }, { fileId: mismatch, code: "source_bytes_mismatch" },
      { fileId: changed, code: "source_changed_during_read" },
    ]));
    expect((await pool.query("select checksum from files where id=any($1::uuid[])", [[unreadable, mismatch, changed]])).rows.every(row => row.checksum === null)).toBe(true);
    expect((await pool.query("select count(*)::int n from audit_logs where action='file.content_identity_verified'")).rows[0]!.n).toBe(0);
  });
});

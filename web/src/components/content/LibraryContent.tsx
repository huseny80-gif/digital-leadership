import Link from "next/link";
import { libraryEntriesPresentation, libraryEntryPresentation } from "@digital-leadership/shared";
import type { LibraryEntry, LibrarySection, SubjectLibrary } from "@shared/index";
import { apiGet } from "@/lib/api/client";

export const librarySections: Record<LibrarySection, string> = {
  lectures: "المحاضرات", summaries: "الملخصات", assignments: "الواجبات والأنشطة",
  references: "المراجع", resources: "الموارد والملفات", updates: "التحديثات",
};

export function LibraryEntryContent({ entry: original, subjectId }: { entry: LibraryEntry; subjectId: string }) {
  const entry = libraryEntryPresentation(original);
  return <article className="content-card dl-library-entry" id={entry.id}>
    <h2>{entry.title}</h2>
    <p className="content-card-meta">{[entry.date, entry.author, entry.publisher, entry.year, entry.difficulty].filter(Boolean).join(" · ")}{entry.demo ? " · نموذج تعليمي" : ""}</p>
    {entry.due ? <p>موعد التسليم: {entry.due}</p> : null}
    {entry.description ? <p className="dl-library-text">{entry.description}</p> : null}
    {entry.objectives?.length ? <><h3>أهداف المحاضرة</h3><ul>{entry.objectives.map((p, i) => <li key={i}>{p}</li>)}</ul></> : null}
    {entry.keyPoints?.length ? <><h3>النقاط الرئيسية</h3><ul>{entry.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul></> : null}
    {entry.concepts?.length ? <><h3>المفاهيم</h3><dl>{entry.concepts.map((c, i) => <div key={i}><dt><strong>{c.term}</strong></dt><dd>{c.definition}</dd></div>)}</dl></> : null}
    {entry.terms?.length ? <><h3>المصطلحات</h3><p>{entry.terms.join(" · ")}</p></> : null}
    {entry.note ? <p className="dl-library-text">{entry.note}</p> : null}
    {entry.url ? <p><a className="text-link" href={entry.url} target="_blank" rel="noopener noreferrer">فتح المرجع</a></p> : null}
    {entry.lectureId ? <p><Link className="text-link" href={"/subjects/" + subjectId + "/lectures/" + entry.lectureId}>فتح المحاضرة ومتابعة التقدم</Link></p> : null}
    {entry.assignmentId ? <p><Link className="text-link" href={"/subjects/" + subjectId + "/assignments/" + entry.assignmentId}>فتح التكليف</Link></p> : null}
    {entry.files.map(file => file.inlineReferenceId ? <p key={file.id}><a className="text-link" href={"#library-document-" + file.inlineReferenceId}>{file.label} — عرض المصدر المشترك</a></p> : file.bodyHtml ? <details className="dl-library-document" id={"library-document-" + file.id} key={file.id} open><summary>{file.label}</summary><div className="dl-library-reader" dangerouslySetInnerHTML={{ __html: file.bodyHtml }} /></details> : <div className="dl-library-file" key={file.id}>
      <a className="text-link" href={"/api/library/" + subjectId + "/" + file.id}>{file.label} — {file.filename}</a>
      <small>{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</small>
      {file.filename.toLowerCase().endsWith(".pdf") ? <details><summary>قراءة الملف</summary><iframe title={file.label} src={"/api/library/" + subjectId + "/" + file.id + "?inline=1"} /></details> : null}
    </div>)}
    {entry.unavailableFiles.map((label, i) => <p className="content-card-meta" key={i}>{label}: لم يُرفق الملف في المصدر بعد.</p>)}
  </article>;
}

/** Supplements the same lecture page; authentication and visibility are
 * checked by the library endpoint independently of the requested URL. */
export async function getLectureLibraryEntries(subjectId: string, lectureId: string): Promise<LibraryEntry[]> {
  let library: SubjectLibrary;
  try { library = (await apiGet<SubjectLibrary>("/api/v1/subjects/" + subjectId + "/library")).data; }
  catch { return []; }
  if (!Array.isArray(library.entries)) return [];
  return libraryEntriesPresentation(library.entries.filter(e => e.lectureId === lectureId && ["lectures", "summaries"].includes(e.section)));
}

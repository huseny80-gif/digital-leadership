import type { Pool } from "pg";
import {
  normalizeSearchText,
  searchTerms,
  type ContentSearchResponse,
  type ContentSearchResult,
} from "@digital-leadership/shared";
import { LibraryService } from "../finquiz/catalog.js";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { examQuizVisible } from "../examMaterials/visibility.js";

const sqlNormalize = (expression: string) =>
  `regexp_replace(translate(lower(normalize(${expression}, NFKC)), 'أإآى', 'اااي'), '[ً-ٰٟـ]', '', 'g')`;
const plainText = (value: string | undefined) =>
  (value ?? "").replace(/<[^>]*>/g, " ");

export class SearchService {
  constructor(private readonly pool: Pool) {}

  async search(query: string): Promise<ContentSearchResponse> {
    const terms = searchTerms(query);
    if (!terms.length) return { query, results: [] };
    // Only publication metadata is searched. No answer keys, personal activity,
    // feedback, signed URLs, or internal storage identifiers enter this index.
    const [result, subjects] = await Promise.all([
      this.pool.query<ContentSearchResult>(
        `with searchable as (
        select l.id::text,'lecture' as kind,l.title,s.title as "subjectTitle",
          '/subjects/'||s.id||'/lectures/'||l.id as href,concat_ws(' ',l.title,l.description,s.title) as text
        from lectures l join subjects s on s.id=l.subject_id
        where l.status='published' and l.deleted_at is null and s.status='published' and s.deleted_at is null
        union all
        select i.id::text,case when i.item_type='summary' then 'summary' else 'file' end,i.title,s.title,
          '/subjects/'||s.id||'/lectures/'||l.id,concat_ws(' ',i.title,i.body_text,s.title,f.original_filename)
        from lecture_items i join lectures l on l.id=i.lecture_id join subjects s on s.id=l.subject_id
          left join files f on f.id=i.file_id and f.status='active' and f.deleted_at is null
        where i.item_type in ('summary','pdf') and i.status='published' and i.deleted_at is null
          and l.status='published' and l.deleted_at is null and s.status='published' and s.deleted_at is null
          and (i.item_type='summary' or f.id is not null)
        union all
        select q.id::text,'quiz',q.title,s.title,'/quizzes/'||q.id,concat_ws(' ',q.title,q.description,s.title)
        from quizzes q join subjects s on s.id=q.subject_id left join lectures l on l.id=q.lecture_id
        where q.status='published' and q.deleted_at is null and q.superseded_by is null
          and ${examQuizVisible}
          and s.status='published' and s.deleted_at is null
          and (q.lecture_id is null or (l.subject_id=q.subject_id and l.status='published' and l.deleted_at is null))
      ), matched as (
        select id,kind,title,"subjectTitle",href,row_number() over(partition by kind order by
          case when ${sqlNormalize("title")}=$2 then 0 else 1 end,title,id) as rank
        from searchable where not exists(select 1 from unnest($1::text[]) as term where position(term in ${sqlNormalize("text")})=0)
      ) select id,kind,title,"subjectTitle",href from matched where rank<=8 order by kind,rank`,
        [terms, normalizeSearchText(query)],
      ),
      this.pool.query<{ id: string; title: string }>(
        "select id,title from subjects where status='published' and deleted_at is null order by order_index,id",
      ),
    ]);
    const candidates = [...result.rows];
    const library = new LibraryService(
      new ContentService(new PgContentRepository(this.pool)),
    );
    for (let offset = 0; offset < subjects.rows.length; offset += 5) {
      const batch = subjects.rows.slice(offset, offset + 5);
      await Promise.all(
        batch.map(async (subject) => {
          const entries = (await library.get(subject.id, false)).entries;
          for (const entry of entries) {
            if (
              !["summaries", "references", "resources"].includes(entry.section)
            )
              continue;
            const searchable = normalizeSearchText(
              [
                entry.title,
                subject.title,
                plainText(entry.description),
                entry.note,
                ...(entry.keyPoints ?? []),
                ...(entry.concepts ?? []).map(
                  (c) => `${c.term} ${c.definition}`,
                ),
                ...entry.files.map(
                  (f) => f.filename + " " + plainText(f.bodyHtml),
                ),
              ].join(" "),
            );
            if (!terms.every((term) => searchable.includes(term))) continue;
            candidates.push({
              id: `library-${subject.id}-${entry.id}`,
              kind: entry.section === "summaries" ? "summary" : "file",
              title: entry.title,
              subjectTitle: subject.title,
              href: `/subjects/${subject.id}/library?section=${entry.section}&entry=${encodeURIComponent(entry.id)}`,
            });
          }
        }),
      );
    }
    const rank = (item: ContentSearchResult) => {
      const title = normalizeSearchText(item.title);
      return title === normalizeSearchText(query)
        ? 0
        : terms.every((term) => title.includes(term))
          ? 1
          : 2;
    };
    candidates.sort(
      (a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, "ar"),
    );
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    return {
      query,
      results: candidates.filter((item) => {
        if (seen.has(item.href + "|" + item.title)) return false;
        seen.add(item.href + "|" + item.title);
        const count = counts.get(item.kind) ?? 0;
        if (count >= 4) return false;
        counts.set(item.kind, count + 1);
        return true;
      }),
    };
  }
}

/** Read-only visual projections of a published, source-verified summary. */
export interface SummaryVisualEvidence { quote: string; startLine: number; endLine: number }
export interface SummaryVisualPoint { id: string; label: string; text: string; evidence: SummaryVisualEvidence[] }
export interface SummaryVisualSection { id: string; title: string; points: SummaryVisualPoint[] }
export interface SummaryVisualSequence {
  id: string; title: string; kind: "source_order" | "process" | "history" | "cycle";
  steps: Array<{ label: string; pointId?: string; sectionId?: string }>;
}
export interface SummaryVisualTriad {
  title: string; pointIds: string[];
  flow?: { pointId: string; labels: string[]; summaryQuote: string };
  complementaryPointIds: string[];
}
export interface SummaryVisualLecture {
  id: string; title: string; number: number; available: boolean;
  sectionCount: number; conceptCount: number;
}
export interface SummaryVisualIndex {
  policy: "source-bound-summary-visuals-v1";
  subject: { id: string; title: string };
  lectures: SummaryVisualLecture[];
}
export interface SummaryVisualDocument {
  policy: SummaryVisualIndex["policy"];
  subject: SummaryVisualIndex["subject"];
  lecture: Pick<SummaryVisualLecture, "id" | "title" | "number">;
  source: { filename: string; sha256: string; summaryRevision: string };
  sections: SummaryVisualSection[];
  sequences: SummaryVisualSequence[];
  triad?: SummaryVisualTriad;
}

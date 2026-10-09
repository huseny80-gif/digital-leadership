/** Print-only text from the learner's already-authorized view. No grading keys,
 * attempt mutations, source fetching, or document storage are part of export. */
export interface StudyPrintBlock { text: string; heading?: boolean }
export interface StudyPrintDocument {
  kind: "questions" | "summary";
  title: string;
  subtitle: string;
  blocks: StudyPrintBlock[];
}

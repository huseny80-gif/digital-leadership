import type { RequestHandler } from "express";
import { ARABIC_PROOFREADING_POLICY, proofreadAcademicContent } from "@digital-leadership/shared";

/** Read/presentation boundary only. Domain services still validate original
 * evidence and grade original option IDs before a display copy is returned. */
export const academicPresentation: RequestHandler = (req, res, next) => {
  if (!/^\/(?:subjects|lectures|quizzes|attempts|study-tools)(?:\/|$)/u.test(req.path)
    && !/^\/admin\/subjects\/[^/]+\/exam-material(?:\/|$)/u.test(req.path)) { next(); return; }
  const json = res.json;
  res.json = function (body) {
    if (this.statusCode >= 400) return json.call(this, body);
    this.set("X-Academic-Presentation", ARABIC_PROOFREADING_POLICY);
    return json.call(this, proofreadAcademicContent(body));
  };
  next();
};

import { hasBrokenSourceEncoding } from "../contentAutomation/sourceTextQuality.js";

/** A checksum proves provenance, not legibility. Never repair uncertain words
 * with a language model. Keep layout cleanup separate from factual evidence. */
export function isSourceLayoutNoise(text: string): boolean {
  return /(?:https?:\/\/|www\.|[\w-]+\.(?:io|com|org|net|is|edu|gov)(?:[./]|\b)|academic[- ]cv[- ]website|github\s*\.)/iu.test(text)
    || /(?:<<|>>|[‹›]{2}|[←→]{2})/u.test(text)
    || /^(?:د\s*\.|أ\s*\.\s*د\s*\.)\s*.{0,150}(?:المعهد|جامعة|كلية)/u.test(text.trim());
}

export function readableSourcePassage(text: string): boolean {
  if (hasBrokenSourceEncoding(text) || isSourceLayoutNoise(text)) return false;
  const arabic = text.normalize("NFC").match(/[\u0621-\u064A\u064B-\u065F]+/gu) ?? [];
  const detached = arabic.filter(word => word.replace(/[\u064B-\u065F]/gu, "").length === 1).length;
  // Detached letters and welded words are symptoms of broken font mappings.
  // Standalone conjunctions in academic prose remain allowed.
  if (arabic.length >= 5 && detached >= 3 && detached / arabic.length > .12) return false;
  if (arabic.some(word => word.replace(/[\u064B-\u065F]/gu, "").length > 22)) return false;
  return true;
}

export function usableQuestionPassage(text: string): boolean {
  if (!readableSourcePassage(text) || text.length < 60 || text.length > 650) return false;
  const tokens = text.match(/[\p{L}\p{M}]+/gu) ?? [];
  const arabic = tokens.filter(token => /^[\u0621-\u064A\u064B-\u065F]+$/u.test(token));
  if (arabic.filter(word => word.length >= 3).length < 6) return false;
  // UI labels, tables, navigation, OCR Latin fragments and unfinished wraps
  // are not complete academic assertions, even if their source is genuine.
  if (/[|©@]|\b(?:\w+\/){2,}|[=<>]{2}/u.test(text) || !/[.!؟؛]$/u.test(text.trim())) return false;
  const latin = tokens.filter(token => /^[a-z]+$/iu.test(token));
  if (latin.some(token => /^([a-z])\1{2,}$/u.test(token))) return false;
  if (latin.some(token => token.length <= 2 && !/^(?:AI|ML|IT|of|in|is|to|or|on|as|by|an)$/iu.test(token))) return false;
  return !/^\s*(?:[0-9٠-٩]+\s*[-–.]\s*)?(?:محاضرات|إعداد|اعداد|المعهد|الأسبوع|الاسبوع)(?:\s|$)/u.test(text);
}

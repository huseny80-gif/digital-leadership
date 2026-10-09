export type AcademicVoiceGender = "ذكر" | "أنثى" | "غير محدد";

export interface AcademicVoiceDescriptor {
  name: string;
  label: string;
  region: string;
  gender: AcademicVoiceGender;
  priority: number;
  localService: boolean;
}

/** Browser voice names differ by platform; classify known aliases without inventing unavailable voices. */
export function describeArabicVoice(name: string, voiceURI: string, lang: string, localService = false): AcademicVoiceDescriptor {
  const source = `${name} ${voiceURI}`;
  if (/(?:^|\s|[-_])(basil|basel|باسل)(?:\s|[-_]|$)/i.test(source)) return { name, label: "باسل", region: "عراقي", gender: "ذكر", priority: 0, localService };
  if (/(?:^|\s|[-_])(rana|رنا)(?:\s|[-_]|$)/i.test(source)) return { name, label: "رنا", region: "عراقي", gender: "أنثى", priority: 1, localService };
  const gender: AcademicVoiceGender = /(?:female|woman|zira|hoda|laila|layla|مريم|هدى|ليلى|أنثى)/i.test(source) ? "أنثى" : "غير محدد";
  const regionCode = lang.match(/^ar[-_]([a-z]{2})/i)?.[1]?.toUpperCase();
  return { name, label: name, region: regionCode ? `عربي (${regionCode})` : "عربي", gender, priority: 2, localService };
}

export function sortAcademicVoices<T extends AcademicVoiceDescriptor>(voices: T[]): T[] {
  return [...voices].sort((left, right) => left.priority - right.priority || Number(right.localService) - Number(left.localService) || left.label.localeCompare(right.label, "ar"));
}

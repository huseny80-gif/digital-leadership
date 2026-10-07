import { Fragment } from "react";
import { normalizeSearchText, searchTerms } from "@digital-leadership/shared";

/** Map normalized Arabic letters back to the original text. Render React text
 * nodes only, so matches can never introduce HTML or executable markup. */
export function highlightRanges(
  text: string,
  query: string,
): Array<[number, number]> {
  let normalized = "";
  const offsets: Array<[number, number]> = [];
  let offset = 0;
  for (const character of text) {
    const value = normalizeSearchText(character);
    normalized += value;
    for (let i = 0; i < value.length; i++)
      offsets.push([offset, offset + character.length]);
    offset += character.length;
  }
  const ranges: Array<[number, number]> = [];
  for (const term of searchTerms(query)) {
    let from = 0;
    let index = normalized.indexOf(term, from);
    while (index !== -1) {
      ranges.push([offsets[index][0], offsets[index + term.length - 1][1]]);
      from = index + term.length;
      index = normalized.indexOf(term, from);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1])
      previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
export function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const ranges = highlightRanges(text, query);
  return (
    <>
      {ranges.map(([start, end], index) => {
        const before = text.slice(index ? ranges[index - 1][1] : 0, start);
        return (
          <Fragment key={start}>
            {before}
            <mark>{text.slice(start, end)}</mark>
          </Fragment>
        );
      })}
      {text.slice(ranges.at(-1)?.[1] ?? 0)}
    </>
  );
}

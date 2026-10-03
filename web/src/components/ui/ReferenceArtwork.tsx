import type { CSSProperties } from "react";

/** Display the supplied artwork without regeneration or recompression.
 * Only artwork regions are reused; navigation, cards and data are real UI. */
export function ReferenceArtwork({ x, y, width, height, className = "", eager = false }: {
  x: number; y: number; width: number; height: number; className?: string; eager?: boolean;
}) {
  const style = {
    "--art-width": `${1280 / width * 100}%`, "--art-height": `${640 / height * 100}%`,
    "--art-left": `${-x / width * 100}%`, "--art-top": `${-y / height * 100}%`,
  } as CSSProperties;
  return <span className={`dl-reference-artwork ${className}`} style={style} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element -- this fixed-dimension artwork atlas is intentionally clipped without image transformations */}
    <img src="/design/dashboard-reference.jpg" alt="" width={1280} height={640} loading={eager ? "eager" : "lazy"} draggable={false} />
  </span>;
}

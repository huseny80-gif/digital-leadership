import type { SubjectTheme } from "./subjectTheme";

// Coordinates refer to the supplied 595 × 1280 artwork. Keep the source
// untouched so the brain, gavel, shield, connected bulb and gears stay exact.
const subjectIconRegions: Record<
  SubjectTheme,
  { x: number; y: number; width: number; height: number }
> = {
  ai: { x: 126, y: 313, width: 180, height: 155 },
  legal: { x: 373, y: 312, width: 180, height: 152 },
  cyber: { x: 139, y: 627, width: 154, height: 155 },
  innovation: { x: 384, y: 624, width: 153, height: 158 },
  risk: { x: 135, y: 935, width: 163, height: 154 },
};

export function SubjectIcon({
  theme,
  idPrefix,
}: {
  theme: SubjectTheme;
  idPrefix: string;
}) {
  const region = subjectIconRegions[theme];
  const edgeId = idPrefix + "-reference-edge";
  const maskId = idPrefix + "-reference-mask";

  return (
    <svg
      className="dl-subject-mark"
      viewBox={[region.x, region.y, region.width, region.height].join(" ")}
      aria-hidden="true"
      focusable="false"
      data-subject-icon={theme}
    >
      <defs>
        <filter id={edgeId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={region.x}
          y={region.y}
          width={region.width}
          height={region.height}
        >
          <rect
            x={region.x + 6}
            y={region.y + 6}
            width={region.width - 12}
            height={region.height - 12}
            rx="22"
            fill="#fff"
            filter={"url(#" + edgeId + ")"}
          />
        </mask>
      </defs>
      <image
        href="/design/subject-icons-reference.jpg"
        width="595"
        height="1280"
        mask={"url(#" + maskId + ")"}
      />
    </svg>
  );
}

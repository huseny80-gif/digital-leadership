import { contrastRatio, hexToRgb, palette } from "../../src/theme/tokens";

describe("theme tokens", () => {
  it("parses hex colours", () => {
    expect(hexToRgb("#004D40")).toEqual([0, 77, 64]);
    expect(() => hexToRgb("teal")).toThrow(/Invalid hex/);
  });

  it("keeps body text and gold accents WCAG AA on the petroleum background", () => {
    expect(contrastRatio(palette.ink100, palette.petroleum900)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.ink300, palette.petroleum900)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.gold300, palette.petroleum700)).toBeGreaterThanOrEqual(4.5);
    // Dark text on the gold primary button
    expect(contrastRatio(palette.petroleum900, palette.gold500)).toBeGreaterThanOrEqual(4.5);
  });
});

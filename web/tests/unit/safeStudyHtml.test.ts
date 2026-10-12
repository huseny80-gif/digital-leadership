import { describe, expect, it } from "vitest";
import { safeStudyHtml } from "@/lib/security/safeHtml";

describe("academic HTML reader sanitization", () => {
  it("preserves Arabic headings, scientific wording, lists and tables", () => {
    const html = '<h2>الشرط الأول</h2><p>لا يجوز حذف الرقم ٢.</p><table><tr><td colspan="2">المفهوم</td></tr></table><ul><li>مصطلح</li></ul>';
    const safe = safeStudyHtml(html); expect(safe).toContain("لا يجوز حذف الرقم ٢."); expect(safe).toContain('<td colspan="2">'); expect(safe).toContain("<h2>");
  });
  it("removes executable elements, event handlers, styles and encoded unsafe URLs", () => {
    const html = '<script>alert(1)</script><svg onload="alert(1)"></svg><img src="x" onerror="alert(1)"><a href="jav&#x61;script:alert(1)" onclick="evil()">مفهوم</a><p style="background:url(javascript:evil)">نص</p><iframe srcdoc="evil"></iframe>';
    const safe = safeStudyHtml(html); expect(safe).not.toMatch(/script|onerror|onload|onclick|style=|iframe|svg/i); expect(safe).toContain("مفهوم"); expect(safe).toContain("نص");
  });
  it("handles malformed and namespace-based HTML without promoting active content", () => {
    for (const html of ['<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">', '<svg><foreignObject><p onmouseover=evil()>text</p></foreignObject></svg>', '<a href="//evil.example">ref</a><img src="data:image/svg+xml,evil">']) {
      const safe = safeStudyHtml(html); expect(safe).not.toMatch(/<\/?(?:script|svg|math|iframe|style)\b|\son\w+=|href="\/\/|src="data:/iu);
    }
  });
  it("permits passive HTTPS references with safe rel attributes", () => {
    expect(safeStudyHtml('<a href="https://example.org/source" target="_blank">مرجع</a>')).toContain('rel="noopener noreferrer"');
  });
});

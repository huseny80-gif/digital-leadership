import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutPage from "@/app/about/page";
import { aboutProfile, contactInfo, comingSoonChannels } from "@/config/about";

describe("About page (/about)", () => {
  it("renders without error", () => {
    render(<AboutPage />);
    expect(screen.getByText("من نحن")).toBeInTheDocument();
  });

  it("renders the exact verified name/jobTitle/role/bio/facts", () => {
    render(<AboutPage />);
    expect(screen.getByText(aboutProfile.name)).toBeInTheDocument();
    expect(screen.getByText(aboutProfile.jobTitle)).toBeInTheDocument();
    expect(screen.getByText(aboutProfile.role)).toBeInTheDocument();
    expect(screen.getByText(aboutProfile.bio)).toBeInTheDocument();
    for (const fact of aboutProfile.facts) {
      expect(screen.getByText(fact)).toBeInTheDocument();
    }
  });

  it("renders the profile photo with the correct alt text and expected source path", () => {
    render(<AboutPage />);
    const img = screen.getByAltText(aboutProfile.name) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe(aboutProfile.photoPath);
  });

  it("renders correct actionable phone/whatsapp/email links", () => {
    render(<AboutPage />);
    expect(screen.getByText(`الهاتف: ${contactInfo.phone}`).closest("a")).toHaveAttribute("href", `tel:${contactInfo.phone}`);
    expect(screen.getByText("واتساب").closest("a")).toHaveAttribute("href", `https://wa.me/${contactInfo.whatsapp}`);
    expect(screen.getByText(`البريد الإلكتروني: ${contactInfo.email}`).closest("a")).toHaveAttribute(
      "href",
      `mailto:${contactInfo.email}`,
    );
  });

  it("never invents an address", () => {
    render(<AboutPage />);
    expect(screen.queryByText(/العنوان/)).not.toBeInTheDocument();
  });

  it("shows Telegram/LinkedIn/Facebook as disabled 'قريباً' with no real link", () => {
    render(<AboutPage />);
    for (const channel of comingSoonChannels) {
      const el = screen.getByText(`${channel} — قريباً`);
      expect(el.closest("a")).toBeNull();
      expect(el).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("is rendered right-to-left", () => {
    const { container } = render(<AboutPage />);
    expect(container.querySelector("main")).toHaveAttribute("dir", "rtl");
  });

  it("never uses dangerouslySetInnerHTML anywhere in the page source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.resolve(__dirname, "../../src/app/about/page.tsx"), "utf-8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});

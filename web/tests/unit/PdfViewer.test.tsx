import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PdfViewer } from "@/components/pdf/PdfViewer";

/**
 * PHASE 09A §"Testing" 8-12: the viewer requests the signed URL through
 * the backend file endpoint (via the Next.js proxy route), never
 * persists or logs it, and handles both success and error responses
 * safely.
 */
describe("PdfViewer", () => {
  const SIGNED_URL = "http://localhost:4000/api/v1/files/local-object/some-key?token=abc123&expires=9999999999";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a placeholder when no file is attached", () => {
    render(<PdfViewer fileId={null} title="Untitled" />);
    expect(screen.getByText(/not available yet/i)).toBeInTheDocument();
  });

  it("8/11. requests the signed URL through the backend file endpoint and renders it once authorized", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { url: SIGNED_URL, expiresAt: new Date().toISOString() } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PdfViewer fileId="file-1" title="Lecture Slides" />);
    fireEvent.click(screen.getByRole("button", { name: /view pdf/i }));

    await waitFor(() => expect(screen.getByTitle("PDF viewer: Lecture Slides")).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith("/api/files/file-1", expect.objectContaining({ cache: "no-store" }));
    const iframe = screen.getByTitle("PDF viewer: Lecture Slides") as HTMLIFrameElement;
    expect(iframe.src).toBe(SIGNED_URL);
  });

  it("9. never persists the signed URL to localStorage or sessionStorage", async () => {
    const localSetSpy = vi.spyOn(Storage.prototype, "setItem");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { url: SIGNED_URL, expiresAt: new Date().toISOString() } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PdfViewer fileId="file-1" title="Lecture Slides" />);
    fireEvent.click(screen.getByRole("button", { name: /view pdf/i }));
    await waitFor(() => expect(screen.getByTitle("PDF viewer: Lecture Slides")).toBeInTheDocument());

    for (const call of localSetSpy.mock.calls) {
      expect(String(call[1])).not.toContain("token=");
    }
  });

  it("10. never logs the signed URL", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { url: SIGNED_URL, expiresAt: new Date().toISOString() } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PdfViewer fileId="file-1" title="Lecture Slides" />);
    fireEvent.click(screen.getByRole("button", { name: /view pdf/i }));
    await waitFor(() => expect(screen.getByTitle("PDF viewer: Lecture Slides")).toBeInTheDocument());

    for (const spy of [logSpy, errorSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        expect(call.join(" ")).not.toContain("token=");
      }
    }
  });

  it("12. handles a 404 (unauthorized/not found) response safely, offering retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "not_found", message: "File not found." } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PdfViewer fileId="file-1" title="Lecture Slides" />);
    fireEvent.click(screen.getByRole("button", { name: /view pdf/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("retry re-requests a fresh signed URL through the backend rather than reusing the old one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: { code: "internal_error", message: "x" } }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { url: SIGNED_URL, expiresAt: new Date().toISOString() } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<PdfViewer fileId="file-1" title="Lecture Slides" />);
    fireEvent.click(screen.getByRole("button", { name: /view pdf/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByTitle("PDF viewer: Lecture Slides")).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

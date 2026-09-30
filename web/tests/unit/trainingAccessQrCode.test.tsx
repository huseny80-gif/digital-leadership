import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import { TrainingAccessQrCode } from "@/components/admin/TrainingAccessQrCode";

describe("TrainingAccessQrCode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("generates the QR code from exactly the joinUrl string, encoding nothing else", async () => {
    const toCanvasSpy = vi.spyOn(QRCode, "toCanvas").mockImplementation((_canvas: unknown, _text: unknown, _opts: unknown, cb: unknown) => {
      (cb as (err: unknown) => void)(null);
      return undefined as never;
    });
    render(<TrainingAccessQrCode joinUrl="https://example.test/join/abcDEF123token" label="Cohort A" />);
    await waitFor(() => expect(toCanvasSpy).toHaveBeenCalled());
    const [, encodedText] = toCanvasSpy.mock.calls[0]!;
    expect(encodedText).toBe("https://example.test/join/abcDEF123token");
  });

  it("never encodes a raw DB id, guest session id, or name — only the join URL string is passed to the generator", async () => {
    const toCanvasSpy = vi.spyOn(QRCode, "toCanvas").mockImplementation((_canvas: unknown, _text: unknown, _opts: unknown, cb: unknown) => {
      (cb as (err: unknown) => void)(null);
      return undefined as never;
    });
    const joinUrl = "https://example.test/join/opaqueTokenOnly";
    render(<TrainingAccessQrCode joinUrl={joinUrl} label="Ahmad's cohort" />);
    await waitFor(() => expect(toCanvasSpy).toHaveBeenCalled());
    expect(toCanvasSpy.mock.calls[0]![1]).toBe(joinUrl);
    // The label (which could contain a name) is used only for the
    // accessible label/filename — never passed as the encoded text.
    expect(toCanvasSpy.mock.calls[0]![1]).not.toContain("Ahmad");
  });

  it("renders a canvas with an accessible label and a working Download QR button", async () => {
    vi.spyOn(QRCode, "toCanvas").mockImplementation((_canvas: unknown, _text: unknown, _opts: unknown, cb: unknown) => {
      (cb as (err: unknown) => void)(null);
      return undefined as never;
    });
    render(<TrainingAccessQrCode joinUrl="https://example.test/join/token" label="Cohort A" />);
    await waitFor(() => {
      expect(screen.getByLabelText("QR code for Cohort A")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /download qr/i })).toBeEnabled();
  });

  it("shows an error state and disables download if QR generation fails", async () => {
    vi.spyOn(QRCode, "toCanvas").mockImplementation((_canvas: unknown, _text: unknown, _opts: unknown, cb: unknown) => {
      (cb as (err: unknown) => void)(new Error("boom"));
      return undefined as never;
    });
    render(<TrainingAccessQrCode joinUrl="https://example.test/join/token" label="Cohort A" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/unable to generate/i);
    });
    expect(screen.getByRole("button", { name: /download qr/i })).toBeDisabled();
  });
});

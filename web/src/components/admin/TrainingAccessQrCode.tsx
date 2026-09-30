"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders a QR code for a training-access join URL, entirely client-side
 * (task requirement #2's "do NOT call any third-party QR web API/service
 * that would send the token to a third party" — the URL, which itself
 * carries the opaque join token, never leaves the browser for this).
 *
 * `qrcode` (npm) was chosen because: it is pure JavaScript with no native
 * build step (checked `web/package.json`/`backend/package.json` first —
 * neither had any QR-capable dependency already present), it is small and
 * widely used/maintained, and it can render directly to a `<canvas>`
 * (used here) or produce an SVG/PNG data URL for download, covering both
 * the on-screen QR and the "Download QR" action without a second library.
 *
 * The encoded payload is ONLY `joinUrl` (already just
 * `${WEB_BASE_URL}/join/${token}` — no raw DB id, guest session id, or
 * name is ever passed to this component or encoded).
 */
export function TrainingAccessQrCode({ joinUrl, label }: { joinUrl: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, joinUrl, { width: 176, margin: 1 }, (err) => {
      if (err) setError("Unable to generate QR code.");
    });
  }, [joinUrl]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `training-access-${label.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "qr"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "var(--space-2)" }}>
      {error ? (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : (
        <canvas ref={canvasRef} aria-label={`QR code for ${label}`} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }} />
      )}
      <button type="button" className="btn btn-secondary" onClick={handleDownload} disabled={!!error}>
        Download QR
      </button>
    </div>
  );
}

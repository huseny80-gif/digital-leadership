import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

/**
 * PHASE 09C "Confirmation dialogs work" / "Destructive Operations".
 * `onConfirm` (the actual destructive call) never fires until the dialog
 * is explicitly confirmed — the dialog itself is a UX courtesy, not the
 * security control (the backend re-validates regardless), but it still
 * must behave correctly: cancel does nothing, confirm calls through
 * exactly once, and a rejected confirm shows an error rather than
 * silently closing.
 */
describe("ConfirmButton", () => {
  it("does not call onConfirm until the dialog is confirmed", () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ConfirmButton label="Delete" confirmTitle="Delete?" confirmMessage="Are you sure?" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancel closes the dialog without calling onConfirm", () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ConfirmButton label="Delete" confirmTitle="Delete?" confirmMessage="Are you sure?" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirm calls onConfirm exactly once and closes the dialog on success", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ConfirmButton label="Delete" confirmTitle="Delete?" confirmMessage="Are you sure?" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows a safe error message and keeps the dialog open if the action fails", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("actual backend rejection: last admin"));
    render(<ConfirmButton label="Delete" confirmTitle="Delete?" confirmMessage="Are you sure?" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

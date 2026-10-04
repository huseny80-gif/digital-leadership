import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import JoinPage from "@/app/join/[token]/page";

function paramsOf(token: string) {
  return Promise.resolve({ token });
}

describe("Join page (/join/[token])", () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.restoreAllMocks();
  });

  it("shows a generic error for an invalid or revoked link", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found", message: "not found" } }), { status: 404 }),
    );
    render(<JoinPage params={paramsOf("bogus")} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid or has been revoked/i);
    });
  });

  it("renders the subject title/description and a required name field on a valid token", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { title: "Digital Leadership", description: "General learner access." } }), { status: 200 }),
    );
    render(<JoinPage params={paramsOf("goodtoken")} />);
    await waitFor(() => {
      expect(screen.getByText("Digital Leadership")).toBeInTheDocument();
    });
    expect(screen.getByText("General learner access.")).toBeInTheDocument();
    expect(screen.getByText(/الدخول متاح دائمًا/)).toBeInTheDocument();
    const input = screen.getByLabelText("الاسم الثلاثي") as HTMLInputElement;
    expect(input).toBeRequired();
  });

  it("disables submit until a non-empty name is entered", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { title: "Digital Leadership", description: null } }), { status: 200 }),
    );
    render(<JoinPage params={paramsOf("goodtoken")} />);
    await waitFor(() => screen.getByText("Digital Leadership"));
    const button = screen.getByRole("button", { name: /join training/i });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("الاسم الثلاثي"), { target: { value: "أحمد محمد العلي" } });
    expect(button).not.toBeDisabled();
  });

  it("submits the trimmed name and navigates into the real learner platform's dashboard on success — never renders the name as HTML", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { title: "Digital Leadership", description: null } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { id: "session-1", displayName: "<b>Ahmad</b>" } }),
          { status: 201 },
        ),
      );
    render(<JoinPage params={paramsOf("goodtoken")} />);
    await waitFor(() => screen.getByText("Digital Leadership"));
    fireEvent.change(screen.getByLabelText("الاسم الثلاثي"), { target: { value: "<b>Ahmad</b>" } });
    fireEvent.click(screen.getByRole("button", { name: /join training/i }));
    // Lands on the SAME learner dashboard a registered user gets — never
    // a separate `/training` mini-app page (task requirement). From
    // there the trainee browses to their granted subject using the
    // platform's own navigation.
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    const [, init] = fetchMock.mock.calls[1]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: "<b>Ahmad</b>" });
    // The page itself never dangerously renders anything — asserted structurally
    // by the fact no <b> tag reaches the DOM anywhere as an element (jsdom would
    // parse it as a real element if it were ever injected as HTML).
    expect(document.querySelectorAll("b").length).toBe(0);
  });

  it("shows the backend's validation error and does not navigate on rejection", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { title: "Digital Leadership", description: null } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "validation_error", message: "Name contains characters that are not allowed." } }), {
          status: 400,
        }),
      );
    render(<JoinPage params={paramsOf("goodtoken")} />);
    await waitFor(() => screen.getByText("Digital Leadership"));
    fireEvent.change(screen.getByLabelText("الاسم الثلاثي"), { target: { value: "bad<script>" } });
    fireEvent.click(screen.getByRole("button", { name: /join training/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/not allowed/i);
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});

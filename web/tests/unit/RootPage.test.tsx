import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RootPage from "@/app/page";

describe("RootPage", () => {
  it("renders the structural placeholder heading", () => {
    render(<RootPage />);
    expect(screen.getByRole("heading", { name: "Digital Leadership" })).toBeInTheDocument();
  });
});

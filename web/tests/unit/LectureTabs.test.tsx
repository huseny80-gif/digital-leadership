import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LectureTabs } from "@/components/content/LectureTabs";

const subjectId = "ade09563-02ec-4a09-a97b-58857f6cd876";
const lectures = [
  { id: "sixth", title: "المحاضرة السادسة قانونية", orderIndex: 6 },
  { id: "fifth", title: "المحاضرة الخامسة قانونية", orderIndex: 5 },
];

describe("independent legal lecture navigation", () => {
  it("lets learners move between the fifth and sixth on distinct routes and identifies the open lecture", () => {
    render(<LectureTabs subjectId={subjectId} lectures={lectures} activeId="sixth" />);
    const links = screen.getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["المحاضرة الخامسة قانونية", "المحاضرة السادسة قانونية"]);
    expect(links[0]).toHaveAttribute("href", `/subjects/${subjectId}/lectures/fifth`);
    expect(links[1]).toHaveAttribute("href", `/subjects/${subjectId}/lectures/sixth`);
    expect(links[1]).toHaveAttribute("aria-current", "page");
    expect(links[0]).not.toHaveAttribute("aria-current");
  });

  it("does not add legal lecture navigation to other subjects", () => {
    render(<LectureTabs subjectId="another-subject" lectures={lectures} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

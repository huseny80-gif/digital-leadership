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

  it.each(["2d6c0980-e4d2-4687-9027-cf090b3d1a67", "bc861a76-620d-4646-81ca-c49d24665b75"])("offers independent lecture routes in updated course %s", id => {
    render(<LectureTabs subjectId={id} lectures={[
      { id: "four", title: "المحاضرة الرابعة", orderIndex: 4 },
      { id: "three", title: "المحاضرة الثالثة", orderIndex: 3 },
      { id: "roadmap", title: "خارطة الطريق للحصول على الشهادة الدولية ISO 27001", orderIndex: 7 },
    ]} activeId="three" />);
    expect(screen.getByRole("navigation", { name: "اختيار المحاضرة" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "المحاضرة الثالثة" })).toHaveAttribute("href", `/subjects/${id}/lectures/three`);
    expect(screen.getByRole("link", { name: "المحاضرة الرابعة" })).toHaveAttribute("href", `/subjects/${id}/lectures/four`);
    expect(screen.getByRole("link", { name: /خارطة الطريق/ })).toHaveAttribute("href", `/subjects/${id}/lectures/roadmap`);
  });

  it("does not add course lecture navigation to unsupported subjects", () => {
    render(<LectureTabs subjectId="another-subject" lectures={lectures} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

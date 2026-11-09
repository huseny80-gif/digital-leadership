import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api/proxyPost", () => ({ proxyPost: fake.post }));
import { POST } from "@/app/api/learning/entry/route";

const request = (body = "{}", path = "", origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/learning/entry${path}`, {
  method: "POST", headers: { origin, "content-type": "application/json" }, body,
});
beforeEach(() => { fake.post.mockReset().mockResolvedValue(new Response(JSON.stringify({ data: { recorded: true } }), { headers: { "content-type": "application/json" } })); });
describe("source-bound login report proxy", () => {
  it("forwards only the empty report through existing token/guest-cookie handling", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(fake.post).toHaveBeenCalledWith("/api/v1/learning/entry", {}, expect.any(String));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each(["{\"userId\":\"other\"}", "{\"role\":\"admin\"}", "{\"displayName\":\"spoof\"}", "[]", "null", "not-json"])("rejects caller-supplied identities or malformed reports %s", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(fake.post).not.toHaveBeenCalled();
  });
  it("rejects cross-site reports and identity query parameters", async () => {
    expect((await POST(request("{}", "", "https://other.example"))).status).toBe(403);
    expect((await POST(request("{}", "?userId=other"))).status).toBe(400);
    expect(fake.post).not.toHaveBeenCalled();
  });
  it("limits streamed report size and contains credential-helper failures", async () => {
    expect((await POST(request(JSON.stringify({ long: "a".repeat(1100) })))).status).toBe(413);
    fake.post.mockRejectedValue(new Error("private credential diagnostics"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private credential diagnostics");
  });
});

import { AuthConfigError, canControlSimulation, createSeismicSupabase, memoryStorage, pickStorage, roleFromAppMetadata } from "../../src/auth/session";

describe("auth/session", () => {
  it("validates configuration before creating a client", () => {
    expect(() => createSeismicSupabase({ url: undefined, anonKey: "k" })).toThrow(AuthConfigError);
    expect(() => createSeismicSupabase({ url: "http://insecure", anonKey: "k" })).toThrow(/https/);
    expect(() => createSeismicSupabase({ url: "https://x.supabase.co", anonKey: "" })).toThrow(/ANON_KEY/);
  });

  it("configures PKCE and tab-scoped session storage by default", () => {
    const factory = vi.fn(() => ({}) as never);
    createSeismicSupabase({ url: "https://x.supabase.co", anonKey: "anon" }, factory);
    const [, , opts] = factory.mock.calls[0] as unknown as [string, string, { auth: Record<string, unknown> }];
    expect(opts.auth).toMatchObject({ flowType: "pkce", storageKey: "seismic.auth", persistSession: true });
    expect(opts.auth.storage).toBe(window.sessionStorage);
  });

  it("falls back to memory storage when Web Storage throws", () => {
    const broken = { setItem() { throw new Error("quota"); } } as unknown as Storage;
    const s = pickStorage(false, { sessionStorage: broken });
    s.setItem("a", "1");
    expect(s.getItem("a")).toBe("1");
    expect(pickStorage(true, {}).getItem("missing")).toBeNull();
    const m = memoryStorage();
    m.setItem("k", "v"); m.removeItem("k");
    expect(m.getItem("k")).toBeNull();
  });

  it("reads roles only from server-controlled app_metadata", () => {
    expect(roleFromAppMetadata({ seismic_role: "party_chief" })).toBe("party_chief");
    expect(roleFromAppMetadata({ seismic_role: "superuser" })).toBe("viewer");
    expect(roleFromAppMetadata(undefined)).toBe("viewer");
    expect(canControlSimulation("observer")).toBe(true);
    expect(canControlSimulation("mechanic")).toBe(false);
  });
});

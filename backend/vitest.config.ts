import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared/index": path.resolve(__dirname, "../shared/src/index.ts"),
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration test files share one real local Postgres database and
    // several truncate/reseed shared tables (users, subjects, ...) between
    // tests — running test files in parallel would race against each
    // other's truncates. Sequential execution trades some wall-clock speed
    // for determinism, appropriate at this test suite's current size.
    fileParallelism: false,
    env: {
      // Local-only test fixtures — NOT production secrets. Tests sign
      // fake-but-correctly-shaped Supabase tokens with a local ES256 key
      // pair (tests/helpers/testJwt.ts), injected into
      // `verifySupabaseToken` via its test-only hook — no shared JWT
      // secret is used or needed for verification anymore. DATABASE_URL
      // points at a local PostgreSQL database seeded with the Phase 5
      // migrations, used only for this test run — see
      // AUTHENTICATION_TEST_PLAN.md "Local Test Database" for how to
      // recreate it.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://postgres:postgres@127.0.0.1:5432/digital_leadership_backend_test",
      // SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are deliberately left unset
      // here so storageProviderFactory.ts selects the local-filesystem
      // substitute (STORAGE_TEST_PLAN.md "Test Environment") — no live
      // Supabase project exists to test against (see
      // STORAGE_IMPLEMENTATION.md "Live Supabase Verification Status").
      LOCAL_STORAGE_DIR: ".local-storage-test",
    },
  },
});

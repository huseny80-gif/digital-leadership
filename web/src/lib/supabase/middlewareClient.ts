import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/config/env";

/**
 * Supabase client bound to a single middleware request/response pair, per
 * the `@supabase/ssr` pattern for Next.js middleware. Used only by
 * `middleware.ts` to check for a session before a protected route
 * renders — see SESSION_SECURITY.md and AUTHENTICATION.md §5 ("Hard
 * Authentication Wall").
 */
export function createSupabaseMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
}

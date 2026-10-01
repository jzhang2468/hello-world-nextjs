import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, type NextResponse } from "next/server";
import { authCookieOptions, getSupabaseConfig } from "./config";

export function createRouteClient(request: NextRequest) {
  const { url, key } = getSupabaseConfig();
  const cookieWrites = new Map<
    string,
    { value: string; options: CookieOptions }
  >();
  const cacheHeaders = new Headers({ "Cache-Control": "private, no-store" });
  const supabase = createServerClient(url, key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headersToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          cookieWrites.set(name, { value, options });
        }
        for (const [name, value] of Object.entries(headersToSet)) {
          cacheHeaders.set(name, value);
        }
      },
    },
  });

  function applyCookies(response: NextResponse) {
    for (const [name, { value, options }] of cookieWrites) {
      response.cookies.set(name, value, options);
    }
    cacheHeaders.forEach((value, name) => response.headers.set(name, value));
    return response;
  }

  return { supabase, applyCookies };
}

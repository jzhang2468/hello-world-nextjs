import "server-only";

import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";

export type DisplayFont = "alfa-slab" | "georgia" | "dm-sans";

const defaultDisplayFont: DisplayFont = "alfa-slab";

export async function getDisplayFont(): Promise<DisplayFont> {
  // Settings must reflect the latest saved value on each page request.
  // Next.js uses this call to stop prerendering, so keep it outside the catch.
  await connection();

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) return defaultDisplayFont;

  try {
    const supabase = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });

    const { data, error } = await supabase
      .from("site_settings")
      .select("display_font")
      .eq("id", "global")
      .abortSignal(AbortSignal.timeout(10_000))
      .maybeSingle();

    if (error) return defaultDisplayFont;

    const value: unknown = data?.display_font;
    if (value === "alfa-slab" || value === "georgia" || value === "dm-sans") {
      return value;
    }
  } catch {
    // An optional design setting must not prevent the catalogue from loading.
  }

  return defaultDisplayFont;
}

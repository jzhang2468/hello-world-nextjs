import "server-only";

import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import type { Product, ProductsResult } from "./product-types";

const unavailableMessage =
  "The collection is temporarily unavailable. Please try again in a moment.";

export async function getProducts(): Promise<ProductsResult> {
  // Fetch at request time so a deployment never embeds a stale catalogue.
  // Keep this outside the catch: Next.js uses it to stop prerendering.
  await connection();

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error("Supabase catalogue environment variables are missing.");
    return { data: null, error: unavailableMessage };
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, category, color, color_hex, price, image_url, description, featured, display_order",
      )
      .order("display_order", { ascending: true })
      .order("id", { ascending: true })
      .abortSignal(AbortSignal.timeout(10_000))
      .returns<Product[]>();

    if (error) {
      console.error("Supabase catalogue query failed.", { code: error.code });
      return { data: null, error: unavailableMessage };
    }

    return { data: data ?? [], error: null };
  } catch {
    console.error("Supabase catalogue request could not complete.");
    return { data: null, error: unavailableMessage };
  }
}

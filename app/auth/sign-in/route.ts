import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { getRequestOrigin, isSameOriginPost } from "@/lib/supabase/origin";

export async function POST(request: NextRequest) {
  const origin = getRequestOrigin(request);
  if (!origin || !isSameOriginPost(request)) {
    return new NextResponse("This sign-in request could not be verified.", { status: 403 });
  }

  const { supabase, applyCookies } = createRouteClient(request);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    return applyCookies(NextResponse.redirect(new URL("/login?error=sign-in", origin), 303));
  }

  return applyCookies(NextResponse.redirect(data.url, 303));
}

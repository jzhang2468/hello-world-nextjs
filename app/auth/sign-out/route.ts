import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { getRequestOrigin, isSameOriginPost } from "@/lib/supabase/origin";

export async function POST(request: NextRequest) {
  const origin = getRequestOrigin(request);
  if (!origin || !isSameOriginPost(request)) {
    return new NextResponse("This sign-out request could not be verified.", { status: 403 });
  }

  const { supabase, applyCookies } = createRouteClient(request);
  const { error } = await supabase.auth.signOut({ scope: "local" });
  const destination = error ? "/login?error=sign-out" : "/";
  return applyCookies(NextResponse.redirect(new URL(destination, origin), 303));
}

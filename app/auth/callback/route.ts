import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { getRequestOrigin } from "@/lib/supabase/origin";
import { isProfileComplete, type Profile } from "@/lib/profile-types";

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  if (!origin) return new NextResponse("Invalid callback origin.", { status: 400 });

  const { supabase, applyCookies } = createRouteClient(request);
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.searchParams.has("error")) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_path")
        .eq("id", data.user.id)
        .maybeSingle<Profile>();
      const destination = isProfileComplete(profile) ? "/captions" : "/profile";
      return applyCookies(NextResponse.redirect(new URL(destination, origin), 303));
    }
  }

  return applyCookies(NextResponse.redirect(new URL("/login?error=callback", origin), 303));
}

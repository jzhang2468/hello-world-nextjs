// Only this app's origins can receive an OAuth callback. We never trust an
// arbitrary forwarded-host header or accept a caller-supplied return URL.
export function isAllowedAppOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password) return false;

    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return true;
    }

    if (url.protocol !== "https:" || url.port) return false;

    return (
      url.hostname === "hello-world-nextjs-gray.vercel.app" ||
      /^hello-world-nextjs-[a-z0-9-]+-jzhang2468\.vercel\.app$/.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

export function getRequestOrigin(request: Request): string | null {
  const origin = new URL(request.url).origin;
  return isAllowedAppOrigin(origin) ? origin : null;
}

export function isSameOriginPost(request: Request): boolean {
  const origin = getRequestOrigin(request);
  return Boolean(
    request.method === "POST" &&
      origin &&
      request.headers.get("origin") === origin &&
      request.headers.get("sec-fetch-site") !== "cross-site",
  );
}

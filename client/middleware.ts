import { NextRequest, NextResponse } from "next/server";

const BACKEND = "http://localhost:8000";
const PROXY_TIMEOUT_MS = 120_000; // 2 minutes — LLM calls can take 60s+

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.pathname;

  // Only proxy API and static-file routes
  if (!url.startsWith("/api/") && !url.startsWith("/outputs/")) {
    return NextResponse.next();
  }

  const target = `${BACKEND}${url}`;
  const query = req.nextUrl.search;

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : req.body;

  const headers = new Headers(req.headers);
  headers.set("host", "localhost:8000");

  // Remove hop-by-hop headers
  for (const h of [
    "content-encoding",
    "content-length",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
  ]) {
    headers.delete(h);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await fetch(`${target}${query}`, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
      redirect: "manual",
    });
    clearTimeout(timer);

    // SSE streams must be passed through verbatim
    if (url.startsWith("/api/status/")) {
      return new Response(res.body, {
        status: res.status,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "x-accel-buffering": "no",
        },
      });
    }

    // Copy allowed headers from upstream
    const respHeaders = new Headers();
    const ALLOWED = [
      "content-type",
      "content-length",
      "set-cookie",
      "location",
      "vary",
    ];
    for (const k of ALLOWED) {
      const v = res.headers.get(k);
      if (v) respHeaders.set(k, v);
    }

    const contentType = res.headers.get("content-type") || "";
    let bodyData: BodyInit;
    if (contentType.includes("json") || contentType.includes("text")) {
      bodyData = await res.text();
    } else {
      bodyData = await res.arrayBuffer();
    }

    return new Response(bodyData, {
      status: res.status,
      headers: respHeaders,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    console.error(`[proxy] ${req.method} ${url} failed:`, (err as Error).message);
    return NextResponse.json(
      { error: "Gateway timeout — backend is busy, please retry." },
      { status: 504 },
    );
  }
}

export const config = {
  matcher: ["/api/:path*", "/outputs/:path*"],
};

import { NextRequest, NextResponse } from "next/server";
import { getApiBaseURL } from "@/lib/apiClient";

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 8_192) {
    return NextResponse.json({ message: "음성 요청이 너무 깁니다." }, { status: 413 });
  }
  try {
    const response = await fetch(`${getApiBaseURL()}/tts/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") ?? "",
      },
      body,
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok || !response.body) {
      return NextResponse.json(
        { message: "음성 안내를 준비하지 못했습니다." },
        { status: response.status },
      );
    }
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": response.headers.get("cache-control") ?? "private, max-age=86400",
        "X-Audio-Cache": response.headers.get("x-audio-cache") ?? "BYPASS",
        "X-Audio-Id": response.headers.get("x-audio-id") ?? "",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "음성 안내 서버의 응답이 지연되고 있습니다." },
      { status: 504 },
    );
  }
}


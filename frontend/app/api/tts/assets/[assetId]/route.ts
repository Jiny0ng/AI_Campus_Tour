import { NextRequest, NextResponse } from "next/server";
import { getApiBaseURL } from "@/lib/apiClient";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;
  try {
    const response = await fetch(
      `${getApiBaseURL()}/tts/assets/${encodeURIComponent(assetId)}`,
      { signal: AbortSignal.timeout(5_000), cache: "no-store" },
    );
    if (!response.ok || !response.body) {
      return NextResponse.json({ message: "음성 파일을 찾지 못했습니다." }, { status: response.status });
    }
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Cache-Control": response.headers.get("cache-control") ?? "private, max-age=604800",
    });
    const etag = response.headers.get("etag");
    if (etag) headers.set("ETag", etag);
    return new Response(response.body, { headers });
  } catch {
    return NextResponse.json({ message: "음성 저장소의 응답이 지연되고 있습니다." }, { status: 504 });
  }
}


import { NextResponse } from "next/server";
import { getApiBaseURL } from "@/lib/apiClient";

export async function GET() {
  try {
    const response = await fetch(`${getApiBaseURL()}/health/network`, {
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("health check failed");
    return NextResponse.json(await response.json(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}


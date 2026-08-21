import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const response = await apiClient.post("/tour/waypoint-route", payload, { timeout: 30000 });
    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json(
      { message: "경유지 경로를 생성하지 못했습니다." },
      { status: 502 },
    );
  }
}

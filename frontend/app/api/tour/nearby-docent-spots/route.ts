import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function POST(request: NextRequest) {
  try {
    const response = await apiClient.post("/tour/nearby-docent-spots", await request.json());
    return NextResponse.json(response.data, { status: response.status });
  } catch {
    return NextResponse.json({ status: "error", nearbySpots: [] }, { status: 502 });
  }
}

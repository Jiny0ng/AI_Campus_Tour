import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const response = await apiClient.post("/tour/nearby-spots", payload);
    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json(
      { message: "주변 스팟을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}

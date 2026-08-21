import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function POST(request: NextRequest) {
  try {
    const response = await apiClient.post("/guide/nearby", await request.json());
    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json({ message: "주변 시설을 불러오지 못했습니다." }, { status: 502 });
  }
}

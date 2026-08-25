import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function GET(request: NextRequest) {
  const purpose = request.nextUrl.searchParams.get("purpose")?.trim() ?? "";
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  try {
    const response = await apiClient.get("/guide/discover", {
      params: { purpose, q: query },
    });
    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json({ message: "목적별 장소를 불러오지 못했습니다." }, { status: 502 });
  }
}

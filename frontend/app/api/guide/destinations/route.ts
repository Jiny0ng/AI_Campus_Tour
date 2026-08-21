import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  try {
    const response = await apiClient.get("/guide/destinations", { params: { q: query } });
    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json({ message: "목적지를 검색하지 못했습니다." }, { status: 502 });
  }
}

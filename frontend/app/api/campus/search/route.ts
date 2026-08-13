import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ query: "", total: 0, results: [] });
  }

  try {
    const response = await apiClient.get("/campus/search", {
      params: { q: query },
    });

    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json(
      { message: "캠퍼스 검색 서버에 연결할 수 없습니다." },
      { status: 502 },
    );
  }
}

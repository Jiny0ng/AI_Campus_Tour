import { NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function GET() {
  try {
    const response = await apiClient.get("/guide/popular");
    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json({ message: "인기 목적지를 불러오지 못했습니다." }, { status: 502 });
  }
}

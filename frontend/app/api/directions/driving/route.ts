import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const response = await apiClient.post("/directions/driving", payload);
    return NextResponse.json(response.data);
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      typeof error.response === "object" &&
      error.response !== null &&
      "status" in error.response
        ? Number(error.response.status)
        : 502;

    return NextResponse.json(
      { message: "자동차 경로를 불러오지 못했습니다." },
      { status },
    );
  }
}

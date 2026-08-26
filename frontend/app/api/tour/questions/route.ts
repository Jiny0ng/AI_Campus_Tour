import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function POST(request: NextRequest) {
  try {
    const response = await apiClient.post("/tour/questions", await request.json(), { timeout: 60000 });
    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json({ message: "질문에 답변하지 못했습니다." }, { status: 502 });
  }
}

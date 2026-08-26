import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/apiClient";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const response = await apiClient.post("/speech/transcribe", form, {
      timeout: 60000,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return NextResponse.json(response.data);
  } catch {
    return NextResponse.json({ message: "음성을 인식하지 못했습니다." }, { status: 502 });
  }
}

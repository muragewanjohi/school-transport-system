import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "school-transport-tracking-api",
      version: "1.0.0"
    }
  });
}

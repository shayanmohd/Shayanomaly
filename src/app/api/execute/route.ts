import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_HTTP_URL || "http://localhost:8081";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const upstream = await fetch(`${BACKEND_URL}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { success: false, error: "Backend unreachable" },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_HTTP_URL || "http://localhost:8081";

export async function GET() {
  try {
    const upstream = await fetch(`${BACKEND_URL}/api/history/anomalies`, { cache: "no-store" });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Backend unreachable", data: [] },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_HTTP_URL || "http://localhost:8081";

export async function GET() {
  try {
    const upstream = await fetch(`${BACKEND_URL}/health`, { cache: "no-store" });
    const data = await upstream.json();
    return NextResponse.json({ frontend: "ok", backend: data });
  } catch {
    return NextResponse.json(
      { frontend: "ok", backend: "unreachable" },
      { status: 200 }
    );
  }
}

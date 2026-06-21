import { NextResponse } from "next/server";

export async function GET() {
  const apiOrigin = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");

  try {
    const response = await fetch(`${apiOrigin}/api/health`, { cache: "no-store" });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ status: "error", service: "makyschool-admin-proxy" }, { status: 502 });
  }
}

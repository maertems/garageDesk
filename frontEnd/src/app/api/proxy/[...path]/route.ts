import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/api";

function getSession(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/sessionId=([^;]+)/);
  return m ? m[1].trim() : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const backendPath = `/api/v1/${path.join("/")}${query ? `?${query}` : ""}`;
  const sessionId = getSession(request.headers.get("cookie") ?? null);
  const headers: Record<string, string> = {};
  if (sessionId) headers["X-Session-Id"] = sessionId;
  const res = await fetch(`${BACKEND_URL}${backendPath}`, { headers });
  const contentType = res.headers.get("content-type") ?? "";
  // Forward binary responses (PDF, etc.) without text decoding
  if (contentType.startsWith("application/pdf") || contentType.startsWith("application/octet-stream")) {
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": res.headers.get("Content-Disposition") ?? 'attachment; filename="document.pdf"',
      },
    });
  }
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendPath = `/api/v1/${path.join("/")}`;
  const sessionId = getSession(request.headers.get("cookie") ?? null);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionId) headers["X-Session-Id"] = sessionId;
  const body = await request.text();
  const res = await fetch(`${BACKEND_URL}${backendPath}`, {
    method: "POST",
    headers,
    body: body || undefined,
  });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendPath = `/api/v1/${path.join("/")}`;
  const sessionId = getSession(request.headers.get("cookie") ?? null);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionId) headers["X-Session-Id"] = sessionId;
  const body = await request.text();
  const res = await fetch(`${BACKEND_URL}${backendPath}`, {
    method: "PATCH",
    headers,
    body: body || undefined,
  });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendPath = `/api/v1/${path.join("/")}`;
  const sessionId = getSession(request.headers.get("cookie") ?? null);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionId) headers["X-Session-Id"] = sessionId;
  const body = await request.text();
  const res = await fetch(`${BACKEND_URL}${backendPath}`, {
    method: "PUT",
    headers,
    body: body || undefined,
  });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendPath = `/api/v1/${path.join("/")}`;
  const sessionId = getSession(request.headers.get("cookie") ?? null);
  const headers: Record<string, string> = {};
  if (sessionId) headers["X-Session-Id"] = sessionId;
  const res = await fetch(`${BACKEND_URL}${backendPath}`, { method: "DELETE", headers });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status });
  }
}

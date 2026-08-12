import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/api";

const SESSION_COOKIE = "sessionId";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { code: data.code || "error", message: data.message || "Erreur de connexion" },
      { status: res.status }
    );
  }
  const sessionId = data.sessionId ?? data.session_id;
  const response = NextResponse.json({ user: data.user });
  if (sessionId) {
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}

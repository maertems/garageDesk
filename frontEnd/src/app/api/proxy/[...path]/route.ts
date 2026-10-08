import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/api";

/**
 * Passe-plat vers l'API, pour les appels faits depuis le navigateur.
 *
 * Le corps de la réponse est transmis tel quel. L'ancienne version le lisait en
 * texte, le parsait en JSON puis le resérialisait avec `NextResponse.json` — pour
 * un `/clients?withVehicles=true` de 650 Ko, c'était deux passes inutiles sur la
 * machine de production, qui est lente. Le proxy ne sait d'ailleurs rien du JSON :
 * il n'a aucune raison de le lire.
 */

function getSession(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/sessionId=([^;]+)/);
  return m ? m[1].trim() : null;
}

function backendPath(path: string[], request: NextRequest): string {
  const query = new URL(request.url).searchParams.toString();
  return `/api/v1/${path.join("/")}${query ? `?${query}` : ""}`;
}

function forwardHeaders(request: NextRequest, withBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (withBody) headers["Content-Type"] = "application/json";
  const sessionId = getSession(request.headers.get("cookie") ?? null);
  if (sessionId) headers["X-Session-Id"] = sessionId;
  return headers;
}

function relay(res: Response): NextResponse {
  if (res.status === 204 || res.body === null) {
    return new NextResponse(null, { status: res.status });
  }
  const contentType = res.headers.get("content-type") ?? "";
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;
  const disposition = res.headers.get("Content-Disposition");
  if (disposition) {
    headers["Content-Disposition"] = disposition;
  } else if (
    contentType.startsWith("application/pdf") ||
    contentType.startsWith("application/octet-stream")
  ) {
    // Un PDF sans nom se télécharge quand même ; une image, elle, est affichée
    // dans la page et ne doit pas recevoir de Content-Disposition de pièce jointe.
    headers["Content-Disposition"] = 'attachment; filename="document.pdf"';
  }
  // Les images passent par ici depuis l'ajout du logo (GET /companySettings/logo).
  if (contentType.startsWith("image/")) headers["Cache-Control"] = "no-cache";
  return new NextResponse(res.body, { status: res.status, headers });
}

async function forward(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
  method: string,
  withBody: boolean
): Promise<NextResponse> {
  const { path } = await params;
  const body = withBody ? await request.text() : undefined;
  const res = await fetch(`${BACKEND_URL}${backendPath(path, request)}`, {
    method,
    headers: forwardHeaders(request, withBody),
    body: body || undefined,
  });
  return relay(res);
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  return forward(request, params, "GET", false);
}

export async function POST(request: NextRequest, { params }: Ctx) {
  return forward(request, params, "POST", true);
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  return forward(request, params, "PATCH", true);
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  return forward(request, params, "PUT", true);
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  return forward(request, params, "DELETE", false);
}

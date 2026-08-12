import { NextRequest, NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0";

// Cookie vroomly mis en cache (session ~1 an, on évite de ré-initialiser à chaque lookup)
let cachedCookie = "";
let cookieExpiry = 0;

async function getSessionCookie(): Promise<string> {
  if (cachedCookie && Date.now() < cookieExpiry) return cachedCookie;
  const res = await fetch("https://www.vroomly.com/", {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  // getSetCookie() retourne un tableau pour gérer les valeurs contenant des virgules
  const setCookies: string[] =
    typeof (res.headers as unknown as Record<string, unknown>).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/).map((s) => s.trim());
  cachedCookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  cookieExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 h
  return cachedCookie;
}

async function doLookup(plate: string, cookie: string) {
  const url = `https://www.vroomly.com/api/v1/vehicleselecter/vehicle/from_identifier/?vehicleIdentifier=${encodeURIComponent(plate)}&vehicleIdentifierType=vplate&setInSession=true`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
  const data = await res.json();
  return { ok: res.ok && data.status !== 400, data };
}

export async function GET(request: NextRequest) {
  const plate = request.nextUrl.searchParams.get("plate")?.trim().toUpperCase();
  if (!plate) return NextResponse.json({ error: "plate required" }, { status: 400 });

  try {
    let cookie = await getSessionCookie();
    let { ok, data } = await doLookup(plate, cookie);

    // Si la session a expiré, on force une nouvelle initialisation et on réessaie
    if (!ok) {
      cachedCookie = "";
      cookie = await getSessionCookie();
      ({ ok, data } = await doLookup(plate, cookie));
    }

    if (!ok) return NextResponse.json({ error: "unknown_plate" }, { status: 404 });

    return NextResponse.json({
      brand: data.manufacturer ?? null,
      model: data.model ?? null,
      type: data.type ?? null,
      registrationDate: data.registrationDate ?? null,
      vin: data.vin ?? null,
    });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
}

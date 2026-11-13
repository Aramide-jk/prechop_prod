import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const REF_CODE_PATTERN = /^[a-f0-9]{12}$/i;
const LINK_PREVIEW_BOT_PATTERN =
  /(WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|Discordbot|LinkedInBot|Pinterestbot|vkShare|Applebot|Googlebot|bingbot|Baiduspider|YandexBot|PetalBot|MJ12bot|AhrefsBot|SemrushBot|curl\/|Wget\/|python-requests|Go-http-client)/i;

function isAutomatedPreviewRequest(request: Request): boolean {
  const purpose = (request.headers.get("purpose") ?? request.headers.get("sec-purpose") ?? "").toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("preview")) return true;

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent.trim() || LINK_PREVIEW_BOT_PATTERN.test(userAgent)) return true;

  return false;
}

export async function POST(request: Request) {
  try {
    if (isAutomatedPreviewRequest(request)) {
      return NextResponse.json({ ok: true, skipped: "preview_bot" });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return NextResponse.json({ ok: true, preview: true });
    }

    const body = (await request.json().catch(() => ({}))) as {
      code?: string;
      sessionId?: string;
      path?: string;
    };

    const code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim().slice(0, 120) : "";
    const path = typeof body.path === "string" ? body.path.trim().slice(0, 200) || "/" : "/";

    if (!REF_CODE_PATTERN.test(code) || sessionId.length < 4) {
      return NextResponse.json({ ok: true, skipped: "invalid_payload" });
    }

    let recorded = false;
    try {
      const cookieStore = await cookies();
      const serverSupabase = createServerClient(url, anonKey, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll() {
            /* Do not mutate auth cookies during lightweight visit pings. */
          },
        },
      });
      const { data, error } = await serverSupabase.rpc("record_referral_link_visit", {
        p_referral_code: code,
        p_session_id: sessionId,
        p_path: path,
      });
      if (!error) {
        recorded = Boolean(data);
        return NextResponse.json({ ok: true, recorded });
      }
    } catch {
      /* Fall back to stateless anon RPC call below. */
    }

    const anonSupabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data, error } = await anonSupabase.rpc("record_referral_link_visit", {
      p_referral_code: code,
      p_session_id: sessionId,
      p_path: path,
    });

    if (error) {
      console.warn("Referral visit RPC warning:", error.message);
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    return NextResponse.json({ ok: true, recorded: Boolean(data) });
  } catch (err) {
    console.warn("Referral link visit recording error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

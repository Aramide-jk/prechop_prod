import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      // In local preview or unconfigured environments, acknowledge gracefully
      return NextResponse.json({ ok: true, preview: true });
    }

    const body = (await request.json().catch(() => ({}))) as { sessionId?: string; path?: string };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 100) : "";
    const path = typeof body.path === "string" ? body.path.slice(0, 120) : "/";

    if (!sessionId) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    await supabase.rpc("record_site_visit", {
      p_session_id: sessionId,
      p_path: path,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Analytics pings must never break customer navigation
    console.warn("Analytics visit recording error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

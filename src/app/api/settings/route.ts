import { NextResponse } from "next/server";
import { parseStoreSettings, defaultStoreSettings, type StoreSettings } from "@/lib/settings";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET() {
  try {
    // 1. Try using the admin client (bypasses RLS)
    try {
      if (process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const adminSupabase = getSupabaseAdminClient();
        const { data: row, error } = await adminSupabase
          .from("referral_campaign_settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle();

        if (!error && row) {
          const parsed = parseStoreSettings(row as Record<string, unknown>);
          return NextResponse.json<StoreSettings>(parsed, { headers: noCacheHeaders });
        }
      }
    } catch (adminErr) {
      console.warn("Could not query settings via admin client, trying REST fallback:", adminErr);
    }

    // 2. Direct REST fallback
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json<StoreSettings>(defaultStoreSettings, { headers: noCacheHeaders });
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/referral_campaign_settings?select=*&id=eq.1`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row === "object" && Object.keys(row).length > 0) {
        const parsed = parseStoreSettings(row as Record<string, unknown>);
        return NextResponse.json<StoreSettings>(parsed, { headers: noCacheHeaders });
      }
    }

    // 3. Fallback to RPC get_public_store_settings if table read is empty due to RLS
    try {
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_store_settings`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      });
      if (rpcRes.ok) {
        const rpcData = await rpcRes.json();
        if (rpcData && typeof rpcData === "object") {
          const parsed = parseStoreSettings(rpcData as Record<string, unknown>);
          return NextResponse.json<StoreSettings>(parsed, { headers: noCacheHeaders });
        }
      }
    } catch {
      /* RPC fallback ignored */
    }

    return NextResponse.json<StoreSettings>(defaultStoreSettings, { headers: noCacheHeaders });
  } catch (error) {
    console.warn("Failed to load store settings from database, serving defaults.", error);
    return NextResponse.json<StoreSettings>(defaultStoreSettings, { headers: noCacheHeaders });
  }
}

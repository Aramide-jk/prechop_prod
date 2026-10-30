import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const privateHeaders = { "Cache-Control": "private, no-store" };

  try {
    const supabase = await getSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in with the admin account to continue.", code: "signed_out" }, { status: 401, headers: privateHeaders });
    }

    const { data, error } = await supabase.rpc("get_admin_abandoned_payments");
    if (error?.code === "42501") {
      return NextResponse.json({ error: "This account is not approved for admin reports.", code: "not_admin" }, { status: 403, headers: privateHeaders });
    }
    if (error) {
      console.error("Admin abandoned-payment report failed.", error.code);
      return NextResponse.json({ error: "The admin payment report is not set up yet. Apply the admin abandoned-payments migration and try again.", code: "report_unavailable" }, { status: 503, headers: privateHeaders });
    }

    return NextResponse.json({ entries: data ?? [] }, { headers: privateHeaders });
  } catch (error) {
    console.error("Admin abandoned-payment endpoint failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "We couldn’t load the admin payment report. Please try again." }, { status: 500, headers: privateHeaders });
  }
}

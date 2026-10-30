import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { deliveryId?: unknown; address?: unknown; deliveryNote?: unknown };
    if (typeof body.deliveryId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.deliveryId)
      || typeof body.address !== "string" || body.address.trim().length < 8 || body.address.trim().length > 300
      || (body.deliveryNote !== undefined && (typeof body.deliveryNote !== "string" || body.deliveryNote.length > 200))) {
      return NextResponse.json({ error: "Enter a valid delivery address." }, { status: 400 });
    }
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to change this delivery." }, { status: 401 });
    const { error } = await supabase.rpc("update_customer_delivery_address", {
      p_delivery_id: body.deliveryId,
      p_address: body.address.trim(),
      p_delivery_note: typeof body.deliveryNote === "string" ? body.deliveryNote.trim() : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ updated: true });
  } catch {
    return NextResponse.json({ error: "We couldn’t update this delivery. Please try again." }, { status: 500 });
  }
}

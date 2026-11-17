import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getNextWeekRange, todayInZaria, buildMenuReminderMessage } from "@/lib/menu-calendar";
import { getWhatsAppChatUrl, sendTransactionalSms } from "@/lib/notifications";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function errorResponse(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status, headers });
}

async function verifyAuth(request: Request) {
  // 1. Check Cron Secret header (for automated Saturday morning crons from Vercel or external scheduler)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { isAuthorized: true, source: "cron", supabase: getSupabaseAdminClient() };
  }

  // 2. Check Admin user session
  try {
    const supabase = await getSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const { data: isAdmin } = await supabase.rpc("is_admin_user");
      if (isAdmin) {
        return { isAuthorized: true, source: "admin_user", supabase, userId: userData.user.id };
      }
    }
  } catch {
    // Session check error
  }

  // 3. In dev / preview allow local checks
  if (process.env.NODE_ENV !== "production") {
    try {
      const adminClient = getSupabaseAdminClient();
      return { isAuthorized: true, source: "dev_local", supabase: adminClient };
    } catch {
      // Fallback
    }
  }

  return { isAuthorized: false, source: "unauthorized" };
}

export async function GET(request: Request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.isAuthorized || !auth.supabase) {
      return errorResponse("Sign in with an approved admin account or provide a valid cron secret.", 401, "unauthorized");
    }

    const { searchParams } = new URL(request.url);
    const referenceDate = searchParams.get("referenceDate") || todayInZaria();
    const sendSms = searchParams.get("sendSms") === "true";
    const nextWeek = getNextWeekRange(referenceDate);

    // 1. Query whether meals are posted for next week
    const { data: pools, error: poolError } = await auth.supabase
      .from("meal_stock_pools")
      .select("id,meal_id,service_date,portion_limit")
      .gte("service_date", nextWeek.start)
      .lte("service_date", nextWeek.end);

    if (poolError) {
      console.error("Failed to query meal_stock_pools:", poolError.message);
      return errorResponse("Could not query weekly menu schedule.", 500);
    }

    const count = (pools ?? []).length;

    // 2. Query store contact details
    const { data: settingsData } = await auth.supabase
      .from("referral_campaign_settings")
      .select("dispatch_phone,whatsapp_number")
      .eq("id", 1)
      .maybeSingle();

    const targetPhone = settingsData?.dispatch_phone || settingsData?.whatsapp_number || process.env.ADMIN_PHONE || "+2348031234567";

    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin || "https://prechop.com.ng";
    const duplicateUrl = `${origin}/admin/menus?copy=next-week`;

    if (count > 0) {
      return NextResponse.json(
        {
          status: "scheduled",
          empty: false,
          count,
          nextWeek,
          message: `Next week (${nextWeek.formatted}) already has ${count} meal(s) posted.`,
        },
        { headers }
      );
    }

    // Next week is empty -> Build reminder
    const messageText = buildMenuReminderMessage({
      startDate: nextWeek.start,
      endDate: nextWeek.end,
      url: duplicateUrl,
      siteName: "PreChop",
    });

    const whatsappUrl = getWhatsAppChatUrl(targetPhone, messageText);
    let smsSent = false;

    if (sendSms) {
      smsSent = await sendTransactionalSms(targetPhone, messageText);
    }

    // Log to admin_audit_logs if admin table is available
    try {
      await auth.supabase.from("admin_audit_logs").insert({
        category: "menus",
        action: "menu_reminder_triggered",
        details: `Checked next week (${nextWeek.formatted}) - found empty. Reminder generated for ${targetPhone}.`,
        metadata: { nextWeek, phone: targetPhone, smsSent, count: 0 },
      });
    } catch {
      // Non-fatal if audit logging is not configured
    }

    return NextResponse.json(
      {
        status: "reminder_needed",
        empty: true,
        count: 0,
        nextWeek,
        phone: targetPhone,
        message: messageText,
        whatsapp_url: whatsappUrl,
        sms_sent: smsSent,
      },
      { headers }
    );
  } catch (error) {
    console.error("Menu reminder check failed:", error);
    return errorResponse("Internal server error during menu reminder check.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.isAuthorized || !auth.supabase) {
      return errorResponse("Sign in with an approved admin account or provide a valid cron secret.", 401, "unauthorized");
    }

    const body = (await request.json().catch(() => ({}))) as {
      referenceDate?: string;
      sendSms?: boolean;
      targetPhone?: string;
    };

    const referenceDate = body.referenceDate || todayInZaria();
    const sendSms = Boolean(body.sendSms);
    const nextWeek = getNextWeekRange(referenceDate);

    const { data: pools, error: poolError } = await auth.supabase
      .from("meal_stock_pools")
      .select("id,meal_id,service_date,portion_limit")
      .gte("service_date", nextWeek.start)
      .lte("service_date", nextWeek.end);

    if (poolError) {
      return errorResponse("Could not query weekly menu schedule.", 500);
    }

    const count = (pools ?? []).length;

    const { data: settingsData } = await auth.supabase
      .from("referral_campaign_settings")
      .select("dispatch_phone,whatsapp_number")
      .eq("id", 1)
      .maybeSingle();

    const targetPhone = body.targetPhone || settingsData?.dispatch_phone || settingsData?.whatsapp_number || process.env.ADMIN_PHONE || "+2348031234567";

    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin || "https://prechop.com.ng";
    const duplicateUrl = `${origin}/admin/menus?copy=next-week`;

    const messageText = buildMenuReminderMessage({
      startDate: nextWeek.start,
      endDate: nextWeek.end,
      url: duplicateUrl,
      siteName: "PreChop",
    });

    const whatsappUrl = getWhatsAppChatUrl(targetPhone, messageText);
    let smsSent = false;

    if (sendSms && count === 0) {
      smsSent = await sendTransactionalSms(targetPhone, messageText);
    }

    return NextResponse.json(
      {
        status: count === 0 ? "reminder_needed" : "scheduled",
        empty: count === 0,
        count,
        nextWeek,
        phone: targetPhone,
        message: messageText,
        whatsapp_url: whatsappUrl,
        sms_sent: smsSent,
      },
      { headers }
    );
  } catch (error) {
    console.error("Menu reminder POST failed:", error);
    return errorResponse("Internal server error during menu reminder execution.", 500);
  }
}

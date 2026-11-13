import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  defaultStoreSettings,
  parseOptionalTimestamp,
  parseStoreSettings,
  type FeaturedClaimBehavior,
  type FeaturedUnlockRule,
  type StoreSettings,
} from "@/lib/settings";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function errorResponse(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status, headers });
}

function normalizeUnlockRule(value: unknown): FeaturedUnlockRule {
  if (value === "referral_count" || value === "accumulated_credit" || value === "both") {
    return value;
  }
  return defaultStoreSettings.featured_unlock_rule;
}

function normalizeClaimBehavior(value: unknown): FeaturedClaimBehavior {
  if (value === "consumes_credit" || value === "bonus_free_claim") {
    return value;
  }
  return defaultStoreSettings.featured_claim_behavior;
}

function cleanNonNegInt(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : fallback;
}

function cleanPosInt(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(1, Math.round(num)) : fallback;
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return errorResponse("Sign in with the admin account to continue.", 401, "signed_out");
    }

    const { data: adminCheck } = await supabase.rpc("is_admin_user");
    if (!adminCheck) {
      return errorResponse("This account is not approved for PreChop admin operations.", 403, "not_admin");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(defaultStoreSettings, { headers });
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/referral_campaign_settings?select=*&id=eq.1`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(defaultStoreSettings, { headers });
    }

    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(parseStoreSettings(row as Record<string, unknown> | null | undefined), { headers });
  } catch (error) {
    console.error("Admin settings GET failed:", error);
    return errorResponse("Failed to load settings.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return errorResponse("Sign in with the admin account to continue.", 401, "signed_out");
    }

    const { data: adminCheck } = await supabase.rpc("is_admin_user");
    if (!adminCheck) {
      return errorResponse("This account is not approved for PreChop admin operations.", 403, "not_admin");
    }

    const body = (await request.json()) as Partial<StoreSettings>;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Database configuration is incomplete.", 500);
    }

    const campaignStartsAt = parseOptionalTimestamp(body.campaign_starts_at);
    const campaignEndsAt = parseOptionalTimestamp(body.campaign_ends_at);
    if (campaignStartsAt && campaignEndsAt && Date.parse(campaignEndsAt) <= Date.parse(campaignStartsAt)) {
      return errorResponse("Campaign end date must be after the campaign start date.", 400, "invalid_window");
    }

    const featuredTargetReferrals = cleanPosInt(
      body.featured_target_referrals ?? body.referrals_required,
      defaultStoreSettings.featured_target_referrals,
    );
    const referralsRequired = cleanPosInt(
      body.referrals_required ?? featuredTargetReferrals,
      defaultStoreSettings.referrals_required,
    );
    const rewardPerReferralNgn = cleanNonNegInt(
      body.reward_per_referral_ngn,
      defaultStoreSettings.reward_per_referral_ngn,
    );
    const featuredTargetCreditNgn = cleanNonNegInt(
      body.featured_target_credit_ngn,
      defaultStoreSettings.featured_target_credit_ngn,
    );

    const payload = {
      id: 1,
      enabled: body.referral_campaign_enabled ?? false,
      referrals_required: referralsRequired,
      reward_amount_ngn: cleanPosInt(body.reward_amount_ngn, defaultStoreSettings.reward_amount_ngn),
      campaign_starts_at: campaignStartsAt,
      campaign_ends_at: campaignEndsAt,
      reward_per_referral_ngn: rewardPerReferralNgn,
      min_qualifying_order_ngn: cleanNonNegInt(
        body.min_qualifying_order_ngn,
        defaultStoreSettings.min_qualifying_order_ngn,
      ),
      featured_goal_enabled:
        body.featured_goal_enabled ?? defaultStoreSettings.featured_goal_enabled,
      featured_meal_slug:
        (typeof body.featured_meal_slug === "string" && body.featured_meal_slug.trim()) ||
        defaultStoreSettings.featured_meal_slug,
      featured_meal_title:
        (typeof body.featured_meal_title === "string" && body.featured_meal_title.trim()) ||
        defaultStoreSettings.featured_meal_title,
      featured_meal_image:
        (typeof body.featured_meal_image === "string" && body.featured_meal_image.trim()) ||
        defaultStoreSettings.featured_meal_image,
      featured_unlock_rule: normalizeUnlockRule(body.featured_unlock_rule),
      featured_target_referrals: featuredTargetReferrals,
      featured_target_credit_ngn: featuredTargetCreditNgn,
      featured_claim_behavior: normalizeClaimBehavior(body.featured_claim_behavior),
      featured_claim_expiry_days: cleanPosInt(
        body.featured_claim_expiry_days,
        defaultStoreSettings.featured_claim_expiry_days,
      ),
      whatsapp_number: body.whatsapp_number ?? defaultStoreSettings.whatsapp_number,
      support_email: body.support_email ?? defaultStoreSettings.support_email,
      dispatch_phone: body.dispatch_phone ?? defaultStoreSettings.dispatch_phone,
      support_hours: body.support_hours ?? defaultStoreSettings.support_hours,
      announcement_banner: body.announcement_banner ?? "",
      service_active: body.service_active ?? true,
      service_paused_message: body.service_paused_message ?? defaultStoreSettings.service_paused_message,
      allow_same_day_ordering: body.allow_same_day_ordering ?? true,
      advance_order_days: cleanPosInt(body.advance_order_days, defaultStoreSettings.advance_order_days),
      min_order_amount_ngn: cleanNonNegInt(body.min_order_amount_ngn, defaultStoreSettings.min_order_amount_ngn),
      max_plates_per_order: cleanPosInt(body.max_plates_per_order, defaultStoreSettings.max_plates_per_order),
      free_delivery_threshold_ngn: cleanNonNegInt(body.free_delivery_threshold_ngn, defaultStoreSettings.free_delivery_threshold_ngn),
      business_name: body.business_name ?? defaultStoreSettings.business_name,
      service_area_tagline: body.service_area_tagline ?? defaultStoreSettings.service_area_tagline,
      footer_tagline: body.footer_tagline ?? defaultStoreSettings.footer_tagline,
      delivery_enabled: body.delivery_enabled ?? true,
      pickup_enabled: body.pickup_enabled ?? false,
      pickup_station_name: body.pickup_station_name ?? defaultStoreSettings.pickup_station_name,
      pickup_station_address: body.pickup_station_address ?? defaultStoreSettings.pickup_station_address,
      pickup_instructions: body.pickup_instructions ?? defaultStoreSettings.pickup_instructions,
      pickup_holding_minutes: cleanPosInt(body.pickup_holding_minutes, defaultStoreSettings.pickup_holding_minutes),
      pickup_unclaimed_policy: body.pickup_unclaimed_policy ?? defaultStoreSettings.pickup_unclaimed_policy,
      pickup_delivery_reroute_enabled: body.pickup_delivery_reroute_enabled ?? defaultStoreSettings.pickup_delivery_reroute_enabled,
      updated_at: new Date().toISOString(),
    };

    const migrationOptionalKeys = [
      "campaign_starts_at",
      "campaign_ends_at",
      "reward_per_referral_ngn",
      "min_qualifying_order_ngn",
      "featured_goal_enabled",
      "featured_meal_slug",
      "featured_meal_title",
      "featured_meal_image",
      "featured_unlock_rule",
      "featured_target_referrals",
      "featured_target_credit_ngn",
      "featured_claim_behavior",
      "featured_claim_expiry_days",
      "pickup_holding_minutes",
      "pickup_unclaimed_policy",
      "pickup_delivery_reroute_enabled",
    ] as const;

    let res = await fetch(`${supabaseUrl}/rest/v1/referral_campaign_settings?id=eq.1`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    let extraOverrides: Partial<StoreSettings> = {};
    let schemaWarning = "";
    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes("column") && errText.includes("schema cache")) {
        const fallbackPayload: Record<string, unknown> = { ...payload };
        const overrides: Record<string, unknown> = {};
        for (const key of migrationOptionalKeys) {
          overrides[key] = payload[key];
          delete fallbackPayload[key];
        }
        extraOverrides = overrides as Partial<StoreSettings>;
        schemaWarning =
          "Core store settings saved, but the Featured Meal Goal toggle and new campaign fields were NOT saved to Supabase yet. Run supabase/migrations/202610060013_campaign_goals_and_link_visits.sql in your Supabase SQL Editor first.";

        res = await fetch(`${supabaseUrl}/rest/v1/referral_campaign_settings?id=eq.1`, {
          method: "PATCH",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(fallbackPayload),
        });
      }
      if (!res.ok) {
        console.error("Failed to update referral_campaign_settings:", errText);
        return errorResponse("Failed to save settings into database.", 500);
      }
    }

    const updatedData = await res.json();
    const updatedRow = Array.isArray(updatedData) ? updatedData[0] : updatedData;
    const parsed = parseStoreSettings({
      ...(updatedRow as Record<string, unknown> | null | undefined),
      ...extraOverrides,
    });

    // Best-effort audit log
    try {
      await supabase.rpc("log_admin_action", {
        p_category: "settings",
        p_action: "update_store_settings",
        p_entity_id: "store_settings",
        p_details: `Updated store & campaign settings: campaign=${parsed.referral_campaign_enabled}, perReferral=${parsed.reward_per_referral_ngn}, minOrder=${parsed.min_qualifying_order_ngn}, featuredGoal=${parsed.featured_goal_enabled}.`,
        p_metadata: {
          referral_campaign_enabled: parsed.referral_campaign_enabled,
          reward_per_referral_ngn: parsed.reward_per_referral_ngn,
          min_qualifying_order_ngn: parsed.min_qualifying_order_ngn,
          featured_goal_enabled: parsed.featured_goal_enabled,
          featured_unlock_rule: parsed.featured_unlock_rule,
          featured_claim_behavior: parsed.featured_claim_behavior,
          delivery_enabled: parsed.delivery_enabled,
          pickup_enabled: parsed.pickup_enabled,
        },
      });
    } catch (auditErr) {
      console.warn("Could not log admin action for settings update:", auditErr);
    }

    return NextResponse.json(
      { success: true, settings: parsed, ...(schemaWarning ? { warning: schemaWarning } : {}) },
      { headers },
    );
  } catch (error) {
    console.error("Admin settings POST failed:", error);
    return errorResponse("Failed to save store settings.", 500);
  }
}

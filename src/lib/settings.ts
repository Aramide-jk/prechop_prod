/**
 * PreChop Application & Store Operations Settings
 * Single source of truth for all configurable store policies, contacts,
 * promotions, and kitchen limits.
 */

export type FeaturedUnlockRule = "referral_count" | "accumulated_credit" | "both";
export type FeaturedClaimBehavior = "consumes_credit" | "bonus_free_claim";

export type StoreSettings = {
  service_active: boolean;
  service_paused_message: string;
  allow_same_day_ordering: boolean;
  advance_order_days: number;
  min_order_amount_ngn: number;
  max_plates_per_order: number;
  free_delivery_threshold_ngn: number;
  whatsapp_number: string;
  support_email: string;
  dispatch_phone: string;
  support_hours: string;
  announcement_banner: string;
  business_name: string;
  service_area_tagline: string;
  footer_tagline: string;
  referral_campaign_enabled: boolean;
  referrals_required: number;
  reward_amount_ngn: number;
  campaign_starts_at: string | null;
  campaign_ends_at: string | null;
  reward_per_referral_ngn: number;
  min_qualifying_order_ngn: number;
  featured_goal_enabled: boolean;
  featured_meal_slug: string;
  featured_meal_title: string;
  featured_meal_image: string;
  featured_unlock_rule: FeaturedUnlockRule;
  featured_target_referrals: number;
  featured_target_credit_ngn: number;
  featured_claim_behavior: FeaturedClaimBehavior;
  featured_claim_expiry_days: number;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  pickup_station_name: string;
  pickup_station_address: string;
  pickup_instructions: string;
  pickup_holding_minutes: number;
  pickup_unclaimed_policy: string;
  pickup_delivery_reroute_enabled: boolean;
};

export const defaultStoreSettings: StoreSettings = {
  service_active: true,
  service_paused_message: "Our kitchen is currently taking a short break. Please check back shortly for fresh pre-orders.",
  allow_same_day_ordering: true,
  advance_order_days: 7,
  min_order_amount_ngn: 0,
  max_plates_per_order: 20,
  free_delivery_threshold_ngn: 0,
  whatsapp_number: "+2348031234567",
  support_email: "support@prechop.com",
  dispatch_phone: "+2348031234567",
  support_hours: "Mon–Sat: 7:00 AM – 8:30 PM",
  announcement_banner: "",
  business_name: "PreChop",
  service_area_tagline: "ABU Samaru, Kongo & Sabon Gari, Zaria",
  footer_tagline: "Good food, planned around you.",
  referral_campaign_enabled: false,
  referrals_required: 5,
  reward_amount_ngn: 1500,
  campaign_starts_at: null,
  campaign_ends_at: null,
  reward_per_referral_ngn: 500,
  min_qualifying_order_ngn: 1500,
  featured_goal_enabled: true,
  featured_meal_slug: "jollof",
  featured_meal_title: "Smoky Jollof Rice + Fried Plantain",
  featured_meal_image: "/images/jollof.png",
  featured_unlock_rule: "both",
  featured_target_referrals: 4,
  featured_target_credit_ngn: 2000,
  featured_claim_behavior: "consumes_credit",
  featured_claim_expiry_days: 14,
  delivery_enabled: true,
  pickup_enabled: false,
  pickup_station_name: "ABU Social Center",
  pickup_station_address: "Social Center, Samaru Campus, ABU Zaria",
  pickup_instructions: "Collect your meal at the PreChop desk inside Social Center during your meal window.",
  pickup_holding_minutes: 45,
  pickup_unclaimed_policy: "Meals not collected within 45 minutes of window close are forfeited for food safety reasons and cannot be refunded.",
  pickup_delivery_reroute_enabled: true,
};

function parseNonNegativeInt(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function parsePositiveInt(value: unknown, fallback: number, min = 1): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.round(parsed));
}

export function parseOptionalTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function parseUnlockRule(value: unknown): FeaturedUnlockRule {
  if (value === "referral_count" || value === "accumulated_credit" || value === "both") {
    return value;
  }
  return defaultStoreSettings.featured_unlock_rule;
}

function parseClaimBehavior(value: unknown): FeaturedClaimBehavior {
  if (value === "consumes_credit" || value === "bonus_free_claim") {
    return value;
  }
  return defaultStoreSettings.featured_claim_behavior;
}

export function parseStoreSettings(row: Record<string, unknown> | null | undefined): StoreSettings {
  if (!row) return defaultStoreSettings;
  const targetReferralsFallback =
    parsePositiveInt(row.referrals_required, defaultStoreSettings.featured_target_referrals);

  return {
    service_active: row.service_active === undefined ? defaultStoreSettings.service_active : Boolean(row.service_active),
    service_paused_message: typeof row.service_paused_message === "string" && row.service_paused_message ? row.service_paused_message : defaultStoreSettings.service_paused_message,
    allow_same_day_ordering: row.allow_same_day_ordering === undefined ? defaultStoreSettings.allow_same_day_ordering : Boolean(row.allow_same_day_ordering),
    advance_order_days: parsePositiveInt(row.advance_order_days, defaultStoreSettings.advance_order_days),
    min_order_amount_ngn: parseNonNegativeInt(row.min_order_amount_ngn, defaultStoreSettings.min_order_amount_ngn),
    max_plates_per_order: parsePositiveInt(row.max_plates_per_order, defaultStoreSettings.max_plates_per_order),
    free_delivery_threshold_ngn: parseNonNegativeInt(row.free_delivery_threshold_ngn, defaultStoreSettings.free_delivery_threshold_ngn),
    whatsapp_number: typeof row.whatsapp_number === "string" && row.whatsapp_number ? row.whatsapp_number : defaultStoreSettings.whatsapp_number,
    support_email: typeof row.support_email === "string" && row.support_email ? row.support_email : defaultStoreSettings.support_email,
    dispatch_phone: typeof row.dispatch_phone === "string" && row.dispatch_phone ? row.dispatch_phone : defaultStoreSettings.dispatch_phone,
    support_hours: typeof row.support_hours === "string" && row.support_hours ? row.support_hours : defaultStoreSettings.support_hours,
    announcement_banner: typeof row.announcement_banner === "string" ? row.announcement_banner : "",
    business_name: typeof row.business_name === "string" && row.business_name ? row.business_name : defaultStoreSettings.business_name,
    service_area_tagline: typeof row.service_area_tagline === "string" && row.service_area_tagline ? row.service_area_tagline : defaultStoreSettings.service_area_tagline,
    footer_tagline: typeof row.footer_tagline === "string" && row.footer_tagline ? row.footer_tagline : defaultStoreSettings.footer_tagline,
    referral_campaign_enabled: row.enabled === undefined ? (row.referral_campaign_enabled === undefined ? defaultStoreSettings.referral_campaign_enabled : Boolean(row.referral_campaign_enabled)) : Boolean(row.enabled),
    referrals_required: parsePositiveInt(row.referrals_required, defaultStoreSettings.referrals_required),
    reward_amount_ngn: parsePositiveInt(row.reward_amount_ngn, defaultStoreSettings.reward_amount_ngn),
    campaign_starts_at: parseOptionalTimestamp(row.campaign_starts_at),
    campaign_ends_at: parseOptionalTimestamp(row.campaign_ends_at),
    reward_per_referral_ngn: parseNonNegativeInt(row.reward_per_referral_ngn, defaultStoreSettings.reward_per_referral_ngn),
    min_qualifying_order_ngn: parseNonNegativeInt(row.min_qualifying_order_ngn, defaultStoreSettings.min_qualifying_order_ngn),
    featured_goal_enabled: row.featured_goal_enabled === undefined ? defaultStoreSettings.featured_goal_enabled : Boolean(row.featured_goal_enabled),
    featured_meal_slug: typeof row.featured_meal_slug === "string" && row.featured_meal_slug.trim() ? row.featured_meal_slug.trim() : defaultStoreSettings.featured_meal_slug,
    featured_meal_title: typeof row.featured_meal_title === "string" && row.featured_meal_title.trim() ? row.featured_meal_title.trim() : defaultStoreSettings.featured_meal_title,
    featured_meal_image: typeof row.featured_meal_image === "string" && row.featured_meal_image.trim() ? row.featured_meal_image.trim() : defaultStoreSettings.featured_meal_image,
    featured_unlock_rule: parseUnlockRule(row.featured_unlock_rule),
    featured_target_referrals: parsePositiveInt(row.featured_target_referrals, targetReferralsFallback),
    featured_target_credit_ngn: parseNonNegativeInt(row.featured_target_credit_ngn, defaultStoreSettings.featured_target_credit_ngn),
    featured_claim_behavior: parseClaimBehavior(row.featured_claim_behavior),
    featured_claim_expiry_days: parsePositiveInt(row.featured_claim_expiry_days, defaultStoreSettings.featured_claim_expiry_days),
    delivery_enabled: row.delivery_enabled === undefined ? defaultStoreSettings.delivery_enabled : Boolean(row.delivery_enabled),
    pickup_enabled: row.pickup_enabled === undefined ? defaultStoreSettings.pickup_enabled : Boolean(row.pickup_enabled),
    pickup_station_name: typeof row.pickup_station_name === "string" && row.pickup_station_name ? row.pickup_station_name : defaultStoreSettings.pickup_station_name,
    pickup_station_address: typeof row.pickup_station_address === "string" && row.pickup_station_address ? row.pickup_station_address : defaultStoreSettings.pickup_station_address,
    pickup_instructions: typeof row.pickup_instructions === "string" && row.pickup_instructions ? row.pickup_instructions : defaultStoreSettings.pickup_instructions,
    pickup_holding_minutes: parsePositiveInt(row.pickup_holding_minutes, defaultStoreSettings.pickup_holding_minutes),
    pickup_unclaimed_policy: typeof row.pickup_unclaimed_policy === "string" && row.pickup_unclaimed_policy ? row.pickup_unclaimed_policy : defaultStoreSettings.pickup_unclaimed_policy,
    pickup_delivery_reroute_enabled: row.pickup_delivery_reroute_enabled === undefined ? defaultStoreSettings.pickup_delivery_reroute_enabled : Boolean(row.pickup_delivery_reroute_enabled),
  };
}

export function isCampaignLive(
  settings: Pick<StoreSettings, "referral_campaign_enabled" | "campaign_starts_at" | "campaign_ends_at">,
  now: Date = new Date(),
): boolean {
  if (!settings.referral_campaign_enabled) return false;
  const nowMs = now.getTime();
  if (settings.campaign_starts_at) {
    const startMs = Date.parse(settings.campaign_starts_at);
    if (Number.isFinite(startMs) && nowMs < startMs) return false;
  }
  if (settings.campaign_ends_at) {
    const endMs = Date.parse(settings.campaign_ends_at);
    if (Number.isFinite(endMs) && nowMs > endMs) return false;
  }
  return true;
}

export async function fetchStoreSettings(): Promise<StoreSettings> {
  if (typeof window === "undefined") {
    return defaultStoreSettings;
  }
  try {
    const res = await fetch(`/api/settings?_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) {
      const data = await res.json();
      return parseStoreSettings(data as Record<string, unknown>);
    }
  } catch (error) {
    console.warn("Could not fetch store settings, falling back to defaults.", error);
  }
  return defaultStoreSettings;
}

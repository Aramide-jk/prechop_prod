import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchStoreSettings, isCampaignLive, type StoreSettings } from "@/lib/settings";

const pendingReferralKey = "prechop-pending-referral-v1";
const REF_CODE_PATTERN = /^[a-f0-9]{12}$/i;

export function captureReferralCode(code: string | null) {
  if (!code || !REF_CODE_PATTERN.test(code.trim())) return;
  try {
    localStorage.setItem(pendingReferralKey, code.trim().toLowerCase());
  } catch {
    /* Referral tracking can wait for sign-in. */
  }
}

export async function recordReferralLinkVisit(
  code: string | null,
  sessionId: string,
  path: string,
) {
  if (!code || !REF_CODE_PATTERN.test(code.trim()) || !sessionId) return;
  const normalized = code.trim().toLowerCase();
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dedupeKey = `prechop_ref_visit_${normalized}_${todayKey}`;

  try {
    if (window.sessionStorage.getItem(dedupeKey)) return;
    window.sessionStorage.setItem(dedupeKey, "1");
  } catch {
    /* Proceed with backend dedupe if sessionStorage is restricted. */
  }

  try {
    await fetch("/api/analytics/referral-visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: normalized, sessionId, path }),
    });
  } catch {
    /* Visit tracking must never interrupt browsing. */
  }
}

export async function attributePendingReferral(storeSettings?: StoreSettings) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  let code: string | null = null;
  try {
    code = localStorage.getItem(pendingReferralKey);
  } catch {
    return;
  }
  if (!code) return;

  try {
    const liveSettings = storeSettings ?? (await fetchStoreSettings());
    if (!isCampaignLive(liveSettings)) {
      return;
    }

    const { error } = await supabase.rpc("attribute_customer_referral", {
      p_referral_code: code,
    });
    if (error) return;
    try {
      localStorage.removeItem(pendingReferralKey);
    } catch {
      /* The database already recorded attribution. */
    }
  } catch {
    /* Keep the referral code for the next authenticated page load. */
  }
}

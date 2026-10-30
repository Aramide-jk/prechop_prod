import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const pendingReferralKey = "prechop-pending-referral-v1";

export function captureReferralCode(code: string | null) {
  if (!code || !/^[a-f0-9]{12}$/i.test(code)) return;
  try { localStorage.setItem(pendingReferralKey, code.toLowerCase()); } catch { /* Referral tracking can wait for sign-in. */ }
}

export async function attributePendingReferral() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  let code: string | null = null;
  try { code = localStorage.getItem(pendingReferralKey); } catch { return; }
  if (!code) return;
  try {
    const { error } = await supabase.rpc("attribute_customer_referral", { p_referral_code: code });
    if (error) return;
    try { localStorage.removeItem(pendingReferralKey); } catch { /* The database already recorded attribution. */ }
  } catch { /* Keep the referral code for the next authenticated page load. */ }
}

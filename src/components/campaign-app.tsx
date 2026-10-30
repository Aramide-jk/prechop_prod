"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ClipboardText, Gift, LinkSimple, Users, Wallet } from "@phosphor-icons/react";
import { SignInDialog } from "@/components/sign-in";
import { CampaignSkeleton } from "@/components/skeletons";
import { money } from "@/lib/menu";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CampaignSettings = { enabled: boolean; referrals_required: number; reward_amount_ngn: number };
type Referral = { id: string; status: "pending" | "qualified"; created_at: string; qualified_at: string | null };
type Reward = { reward_amount_ngn: number; awarded_at: string };

export function CampaignApp() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [reward, setReward] = useState<Reward | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const loadCampaign = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError("Campaigns are unavailable until the app is connected to its database."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data: settingsData, error: settingsError } = await supabase.from("referral_campaign_settings").select("enabled,referrals_required,reward_amount_ngn").eq("id", 1).maybeSingle();
    if (settingsError) { setError(settingsError.message); setLoading(false); return; }
    setSettings(settingsData as CampaignSettings | null);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) { setError(userError.message); setLoading(false); return; }
    setSignedIn(!!user);
    if (!user) { setReferralCode(""); setReferrals([]); setReward(null); setLoading(false); return; }

    const [profileResult, referralsResult, rewardResult] = await Promise.all([
      supabase.from("profiles").select("referral_code").eq("id", user.id).single(),
      supabase.from("customer_referrals").select("id,status,created_at,qualified_at").eq("referrer_id", user.id).order("created_at", { ascending: false }),
      supabase.from("referral_campaign_rewards").select("reward_amount_ngn,awarded_at").eq("referrer_id", user.id).maybeSingle(),
    ]);
    const dataError = profileResult.error ?? referralsResult.error ?? rewardResult.error;
    if (dataError) setError(dataError.message);
    if (profileResult.data) setReferralCode(profileResult.data.referral_code);
    setReferrals((referralsResult.data ?? []) as Referral[]);
    setReward(rewardResult.data as Reward | null);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = setTimeout(() => { void loadCampaign(); }, 0); return () => clearTimeout(timer); }, [loadCampaign]);

  const qualified = referrals.filter(referral => referral.status === "qualified").length;
  const pending = referrals.length - qualified;
  const required = settings?.referrals_required ?? 5;
  const amount = settings?.reward_amount_ngn ?? 1500;
  const progress = Math.min(100, Math.round((qualified / Math.max(required, 1)) * 100));
  const inviteUrl = useMemo(() => referralCode && typeof window !== "undefined" ? `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}` : "", [referralCode]);

  async function shareLink() {
    if (!inviteUrl) return;
    setError("");
    try {
      if (navigator.share) await navigator.share({ title: "Join me on PreChop", text: "Pre-order good food with PreChop. Use my invite link:", url: inviteUrl });
      else { await navigator.clipboard.writeText(inviteUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2200); }
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2200); }
      catch { setError("We couldn’t copy your link. Select and copy the link below."); }
    }
  }

  return <main className="campaign-shell">
    <div className="campaign-heading"><span className="eyebrow">PRECHOP CAMPUS CAMPAIGN</span><h1>Good food travels<br />better with friends.</h1><p>Invite friends to order on PreChop. When they place an order, you move closer to wallet credit for your next meal.</p></div>
    {error && <p role="alert" className="error campaign-error">{error}</p>}
    {loading ? <CampaignSkeleton /> : !settings?.enabled ? <section className="campaign-paused"><Gift size={32} /><h2>The campaign is taking a break.</h2><p>Check back soon to get your personal invite link.</p><Link href="/" className="primary">Back to this week’s menu <ArrowRight size={18} /></Link></section> : <>
      <div className="campaign-banner"><Image src="/images/campaign.jpeg" alt="Refer friends to PreChop and earn meal credit" width={1600} height={900} priority /></div>
      {!signedIn ? <section className="campaign-signin"><div><span className="eyebrow">YOUR PERSONAL INVITE</span><h2>Sign in to get your link.</h2><p>Your progress and earned credit stay connected to your account.</p></div><button className="primary" onClick={() => setSignInOpen(true)}>Sign in to continue <ArrowRight size={18} /></button></section> : <div className="campaign-dashboard">
        <section className="campaign-progress-card"><div className="campaign-card-heading"><div><span className="eyebrow">YOUR CAMPAIGN</span><h2>{reward ? "You earned meal credit." : "Your friends’ orders add up."}</h2></div><span className="campaign-reward"><Gift size={18} /> {money(reward?.reward_amount_ngn ?? amount)}</span></div>
          <div className="campaign-progress-label"><span>Friends who have ordered</span><strong>{Math.min(qualified, required)} <span>of {required}</span></strong></div><div className="campaign-progress-track" role="progressbar" aria-label="Qualified referrals" aria-valuemin={0} aria-valuemax={required} aria-valuenow={Math.min(qualified, required)}><span style={{ width: `${progress}%` }} /></div>
          <p className="campaign-progress-copy">{reward ? `${money(reward.reward_amount_ngn)} has been added to your wallet. It’s ready for your next order.` : `${Math.max(0, required - qualified)} more ${required - qualified === 1 ? "friend needs" : "friends need"} to order for you to earn ${money(amount)} wallet credit.`}</p>
          {reward && <Link className="campaign-wallet-link" href="/wallet"><Wallet size={19} /> View your wallet <ArrowRight size={17} /></Link>}
        </section>
        <section className="campaign-share-card"><span className="eyebrow">SHARE YOUR LINK</span><h2>Invite a friend.</h2><p>They join PreChop from your link. Their first confirmed order counts towards your reward.</p><div className="campaign-link-box"><LinkSimple size={19} /><input aria-label="Your personal referral link" readOnly value={inviteUrl} /><button onClick={() => void shareLink()} aria-label={copied ? "Link copied" : "Copy or share referral link"}>{copied ? <Check size={19} /> : <ClipboardText size={19} />}</button></div><button className="primary campaign-share-button" onClick={() => void shareLink()}>{copied ? "Link copied" : "Share invite link"} <ArrowRight size={18} /></button></section>
        <section className="campaign-friends"><div className="campaign-section-heading"><div><span className="eyebrow">YOUR INVITES</span><h2>Friends on your list.</h2></div><span><Users size={18} /> {referrals.length} joined</span></div>{!referrals.length ? <div className="campaign-empty"><Users size={27} /><p>Your friends will appear here after they create an account from your link.</p></div> : <div className="campaign-friend-list">{referrals.map((referral, index) => <article className="campaign-friend" key={referral.id}><div><span className="campaign-friend-number">{String(referrals.length - index).padStart(2, "0")}</span><div><strong>PreChop friend</strong><small>Joined {new Date(referral.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</small></div></div><span className={`campaign-friend-status ${referral.status}`}>{referral.status === "qualified" ? <><Check size={15} /> Ordered</> : "Order pending"}</span></article>)}</div>}<p className="campaign-pending-note">{pending} {pending === 1 ? "friend has" : "friends have"} joined but haven’t placed an order yet.</p></section>
      </div>}
    </>}
    {signInOpen && <SignInDialog close={() => setSignInOpen(false)} complete={() => { setSignInOpen(false); void loadCampaign(); }} />}
  </main>;
}

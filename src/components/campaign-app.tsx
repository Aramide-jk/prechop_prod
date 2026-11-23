"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ForkKnife, Gift, MapPin, Wallet } from "@phosphor-icons/react";
import { CampaignBenefitsStrip } from "@/components/campaign/campaign-benefits-strip";
import { CampaignHero } from "@/components/campaign/campaign-hero";
import { CampaignHowItWorks } from "@/components/campaign/campaign-how-it-works";
import { CampaignSummaryCards } from "@/components/campaign/campaign-summary-cards";
import { FeaturedMealGoalCard } from "@/components/campaign/featured-meal-goal-card";
import { SignInDialog } from "@/components/sign-in";
import {
  buildCampaignBenefits,
  buildCampaignInviteUrl,
  buildCampaignSteps,
  evaluateCampaignGoalProgress,
  type CampaignClaimStatus,
  type CustomerCampaignSummary,
} from "@/lib/campaign";
import {
  defaultStoreSettings,
  fetchStoreSettings,
  isCampaignLive,
  type StoreSettings,
} from "@/lib/settings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function CampaignApp() {
  const [inviteExpanded, setInviteExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [storeSettings, setStoreSettings] =
    useState<StoreSettings>(defaultStoreSettings);
  const [summary, setSummary] = useState<CustomerCampaignSummary | null>(null);

  const loadCampaignData = useCallback(async () => {
    try {
      const currentNow = Date.now();
      const liveSettings = await fetchStoreSettings();
      setNowMs(currentNow);
      setStoreSettings(liveSettings);

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setSignedIn(false);
        setSummary(null);
        setLoading(false);
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;
      setSignedIn(Boolean(user));

      if (!user) {
        setSummary(null);
        setLoading(false);
        return;
      }

      const { data: rpcSummary, error: rpcError } = await supabase.rpc(
        "get_customer_campaign_summary",
      );

      if (!rpcError && rpcSummary && typeof rpcSummary === "object") {
        setSummary(rpcSummary as CustomerCampaignSummary);
        setLoading(false);
        return;
      }

      // Fallback before migration 202610060013 is pushed: query core tables safely
      const [profileRes, walletRes, refRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name,referral_code")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("wallet_entries")
          .select("amount_ngn")
          .eq("customer_id", user.id),
        supabase
          .from("customer_referrals")
          .select("id,status,qualified_at,created_at")
          .eq("referrer_id", user.id),
      ]);

      const walletBalance = (
        (walletRes.data ?? []) as { amount_ngn: number }[]
      ).reduce((acc, row) => acc + row.amount_ngn, 0);
      const referrals = (refRes.data ?? []) as {
        id: string;
        status: "pending" | "qualified";
        qualified_at: string | null;
        created_at: string;
      }[];
      const qualifiedCount = referrals.filter(
        (r) => r.status === "qualified",
      ).length;
      const evalFallback = evaluateCampaignGoalProgress({
        unlockRule: liveSettings.featured_unlock_rule,
        claimBehavior: liveSettings.featured_claim_behavior,
        targetReferrals: liveSettings.featured_target_referrals,
        targetCreditNgn: liveSettings.featured_target_credit_ngn,
        qualifiedReferrals: qualifiedCount,
        accumulatedCreditNgn:
          qualifiedCount * liveSettings.reward_per_referral_ngn,
      });

      setSummary({
        referral_code: profileRes.data?.referral_code ?? "",
        full_name: profileRes.data?.full_name ?? "Customer",
        wallet_balance_ngn: Math.max(0, walletBalance),
        link_visits: 0,
        pending_referrals: referrals.filter((r) => r.status === "pending")
          .length,
        qualified_referrals: qualifiedCount,
        accumulated_campaign_credit_ngn:
          qualifiedCount * liveSettings.reward_per_referral_ngn,
        referrals: [],
        is_unlocked: evalFallback.isUnlocked,
        unlocked_at: null,
        expires_at: null,
        claim_status: liveSettings.featured_goal_enabled
          ? evalFallback.isUnlocked
            ? "unlocked"
            : "locked"
          : "disabled",
        claimed_at: null,
        claimed_order_id: null,
        campaign_live: isCampaignLive(liveSettings),
      });
    } catch {
      /* Preserve defaults silently if transient network error occurs */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCampaignData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCampaignData]);

  const activeSettings = storeSettings;

  const campaignIsLive =
    nowMs > 0
      ? isCampaignLive(activeSettings, new Date(nowMs))
      : isCampaignLive(activeSettings);

  const effectiveSignedIn = signedIn;
  const inviteCode = summary?.referral_code || "";

  const inviteUrl = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://prechop.com.ng";
    return inviteCode ? buildCampaignInviteUrl(origin, inviteCode) : "";
  }, [inviteCode]);

  const availableCreditNgn = summary?.wallet_balance_ngn ?? 0;
  const linkVisits = summary?.link_visits ?? 0;
  const qualifiedReferrals = summary?.qualified_referrals ?? 0;
  const accumulatedCreditNgn = summary?.accumulated_campaign_credit_ngn ?? 0;

  const goalEvaluation = useMemo(
    () =>
      evaluateCampaignGoalProgress({
        unlockRule: activeSettings.featured_unlock_rule,
        claimBehavior: activeSettings.featured_claim_behavior,
        targetReferrals: activeSettings.featured_target_referrals,
        targetCreditNgn: activeSettings.featured_target_credit_ngn,
        qualifiedReferrals,
        accumulatedCreditNgn,
      }),
    [activeSettings, qualifiedReferrals, accumulatedCreditNgn],
  );

  const effectiveClaimStatus: CampaignClaimStatus =
    !activeSettings.featured_goal_enabled
      ? "disabled"
      : (summary?.claim_status ??
        (goalEvaluation.isUnlocked ? "unlocked" : "locked"));

  const steps = useMemo(
    () => buildCampaignSteps(activeSettings),
    [activeSettings],
  );
  const benefits = useMemo(
    () => buildCampaignBenefits(activeSettings),
    [activeSettings],
  );

  async function handleCopyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* Clipboard API may be unavailable in restricted contexts. */
    }
  }

  async function handleShareLink() {
    if (!inviteUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Join me on PreChop",
          text: "Pre-order fresh meals with PreChop at ABU Zaria using my invite link:",
          url: inviteUrl,
        });
        return;
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
    }
    await handleCopyLink();
  }

  function handleGetInviteOrSignIn() {
    if (!effectiveSignedIn) {
      setSignInOpen(true);
      return;
    }
    setInviteExpanded((prev) => !prev);
  }

  function handleInviteMore() {
    if (!effectiveSignedIn) {
      setSignInOpen(true);
      return;
    }
    setInviteExpanded(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleScrollToHowItWorks() {
    if (typeof document !== "undefined") {
      document
        .getElementById("how-it-works")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const startsInFuture =
    nowMs > 0 &&
    activeSettings.referral_campaign_enabled &&
    Boolean(activeSettings.campaign_starts_at) &&
    Date.parse(activeSettings.campaign_starts_at!) > nowMs;

  const windowHasEnded =
    nowMs > 0 &&
    activeSettings.referral_campaign_enabled &&
    Boolean(activeSettings.campaign_ends_at) &&
    Date.parse(activeSettings.campaign_ends_at!) < nowMs;

  return (
    <main className="cp-shell">
      {loading ? (
        <div
          className="skeleton-campaign"
          aria-label="Loading campaign details"
        >
          <div className="skeleton skeleton-campaign-art" />
          <div className="skeleton skeleton-campaign-progress" />
        </div>
      ) : !campaignIsLive ? (
        <section
          className="cp-paused-card"
          aria-label="Campaign availability status"
        >
          <span className="cp-paused-icon" aria-hidden="true">
            <Gift size={28} weight="regular" />
          </span>
          <span className="cp-eyebrow">PRECHOP CAMPUS CAMPAIGN</span>
          <h1 className="cp-hero-title">
            {startsInFuture
              ? "Our next campus campaign opens soon."
              : windowHasEnded
                ? "This referral campaign window has wrapped up."
                : "Our referral campaign is taking a short break."}
          </h1>
          <p className="cp-hero-desc" style={{ margin: "0 auto" }}>
            {startsInFuture && activeSettings.campaign_starts_at
              ? `New referral links go live on ${new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(activeSettings.campaign_starts_at))}. Any existing meal credit in your wallet remains safe and never expires.`
              : "Any referral credit already in your PreChop wallet remains active and never expires — you can still apply it anytime at checkout."}
          </p>
          <div className="cp-paused-actions">
            <Link href="/" className="cp-btn-primary">
              <ForkKnife size={16} weight="regular" aria-hidden="true" />
              <span>Explore menu</span>
            </Link>
            <Link href="/wallet" className="cp-btn-secondary">
              <Wallet size={16} weight="regular" aria-hidden="true" />
              <span>View wallet</span>
            </Link>
          </div>
        </section>
      ) : (
        <div className="cp-stack">
          <CampaignHero
            inviteUrl={inviteUrl}
            rewardPerReferralNgn={activeSettings.reward_per_referral_ngn}
            bannerImage="/images/open-prechop-box.png"
            featuredGoalEnabled={activeSettings.featured_goal_enabled}
            signedIn={effectiveSignedIn}
            inviteExpanded={inviteExpanded}
            copied={copied}
            onGetInviteLink={handleGetInviteOrSignIn}
            onCopyLink={() => void handleCopyLink()}
            onShareLink={() => void handleShareLink()}
            onScrollToHowItWorks={handleScrollToHowItWorks}
          />

          <CampaignSummaryCards
            availableCreditNgn={availableCreditNgn}
            linkVisits={linkVisits}
            successfulReferrals={qualifiedReferrals}
          />

          {activeSettings.featured_goal_enabled && (
            <FeaturedMealGoalCard
              meal={{
                slug: activeSettings.featured_meal_slug,
                name: activeSettings.featured_meal_title,
                image: activeSettings.featured_meal_image,
                imageAlt: activeSettings.featured_meal_title,
              }}
              evaluation={goalEvaluation}
              claimStatus={effectiveClaimStatus}
              expiresAt={summary?.expires_at}
              signedIn={effectiveSignedIn}
              onInviteMore={handleInviteMore}
            />
          )}

          <CampaignHowItWorks steps={steps} />

          <CampaignBenefitsStrip benefits={benefits} />
        </div>
      )}

      <footer className="footer">
        <div className="footer-links">
          <Link href="/terms">Terms</Link>
          <span aria-hidden="true">·</span>
          <Link href="/privacy">Privacy</Link>
        </div>
        <span className="footer-service-area">
          <MapPin size={14} weight="fill" aria-hidden="true" />
          ABU Samaru, Zaria
        </span>
      </footer>

      {signInOpen && (
        <SignInDialog
          close={() => setSignInOpen(false)}
          complete={() => {
            setSignInOpen(false);
            setInviteExpanded(true);
            void loadCampaignData();
          }}
        />
      )}
    </main>
  );
}

import type {
  FeaturedClaimBehavior,
  FeaturedUnlockRule,
  StoreSettings,
} from "./settings";

export type CampaignHowItWorksStep = {
  id: string;
  icon: "invite" | "order" | "reward";
  title: string;
  description: string;
};

export type CampaignBenefit = {
  id: string;
  icon: "instant" | "wallet" | "repeat" | "meal";
  label: string;
};

export type CampaignReferralEntry = {
  id: string;
  status: "pending" | "qualified";
  reward_ngn: number;
  qualified_at: string | null;
  created_at: string;
  friend_name: string;
};

export type CampaignClaimStatus =
  | "locked"
  | "unlocked"
  | "claimed"
  | "expired"
  | "disabled";

export type CustomerCampaignSummary = {
  referral_code: string;
  full_name: string;
  wallet_balance_ngn: number;
  link_visits: number;
  pending_referrals: number;
  qualified_referrals: number;
  accumulated_campaign_credit_ngn: number;
  referrals: CampaignReferralEntry[];
  is_unlocked: boolean;
  unlocked_at: string | null;
  expires_at: string | null;
  claim_status: CampaignClaimStatus;
  claimed_at: string | null;
  claimed_order_id: string | null;
  campaign_live: boolean;
};

export type CampaignGoalEvaluation = {
  unlockRule: FeaturedUnlockRule;
  claimBehavior: FeaturedClaimBehavior;
  targetReferrals: number;
  targetCreditNgn: number;
  qualifiedReferrals: number;
  accumulatedCreditNgn: number;
  remainingReferrals: number;
  remainingCreditNgn: number;
  progressPercent: number;
  isUnlocked: boolean;
};

function formatNairaPlain(amount: number): string {
  return `₦${Math.max(0, Math.round(amount)).toLocaleString("en-NG")}`;
}

export function evaluateCampaignGoalProgress(params: {
  unlockRule: FeaturedUnlockRule;
  claimBehavior: FeaturedClaimBehavior;
  targetReferrals: number;
  targetCreditNgn: number;
  qualifiedReferrals: number;
  accumulatedCreditNgn: number;
}): CampaignGoalEvaluation {
  const targetReferrals = Math.max(1, Math.round(params.targetReferrals || 1));
  const targetCreditNgn = Math.max(0, Math.round(params.targetCreditNgn || 0));
  const qualifiedReferrals = Math.max(0, Math.round(params.qualifiedReferrals || 0));
  const accumulatedCreditNgn = Math.max(0, Math.round(params.accumulatedCreditNgn || 0));

  const remainingReferrals = Math.max(0, targetReferrals - qualifiedReferrals);
  const remainingCreditNgn = Math.max(0, targetCreditNgn - accumulatedCreditNgn);

  const countRatio = Math.min(1, qualifiedReferrals / targetReferrals);
  const creditRatio =
    targetCreditNgn === 0
      ? qualifiedReferrals > 0
        ? 1
        : 0
      : Math.min(1, accumulatedCreditNgn / targetCreditNgn);

  let isUnlocked = false;
  let progressPercent = 0;

  if (params.unlockRule === "referral_count") {
    isUnlocked = qualifiedReferrals >= targetReferrals;
    progressPercent = Math.round(countRatio * 100);
  } else if (params.unlockRule === "accumulated_credit") {
    isUnlocked =
      targetCreditNgn === 0
        ? qualifiedReferrals > 0
        : accumulatedCreditNgn >= targetCreditNgn && qualifiedReferrals > 0;
    progressPercent = Math.round(creditRatio * 100);
  } else {
    isUnlocked =
      qualifiedReferrals >= targetReferrals &&
      (targetCreditNgn === 0 || accumulatedCreditNgn >= targetCreditNgn);
    const avg = Math.round(((countRatio + creditRatio) / 2) * 100);
    progressPercent = isUnlocked ? 100 : Math.min(99, avg);
  }

  return {
    unlockRule: params.unlockRule,
    claimBehavior: params.claimBehavior,
    targetReferrals,
    targetCreditNgn,
    qualifiedReferrals,
    accumulatedCreditNgn,
    remainingReferrals,
    remainingCreditNgn,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    isUnlocked,
  };
}

export function buildCampaignSteps(settings: StoreSettings): CampaignHowItWorksStep[] {
  const minOrderText =
    settings.min_qualifying_order_ngn > 0
      ? ` of at least ${formatNairaPlain(settings.min_qualifying_order_ngn)}`
      : "";
  const rewardText = formatNairaPlain(settings.reward_per_referral_ngn);

  return [
    {
      id: "invite",
      icon: "invite",
      title: "Invite friends",
      description: "Share your personal invite link with your coursemates.",
    },
    {
      id: "order",
      icon: "order",
      title: "They place an order",
      description: `Your friend places a qualifying order${minOrderText} and completes payment.`,
    },
    {
      id: "reward",
      icon: "reward",
      title: "You earn credit",
      description: settings.featured_goal_enabled
        ? `Earn ${rewardText} wallet credit per friend and unlock your featured meal goal.`
        : `Get ${rewardText} added to your wallet after every qualifying order — use it anytime.`,
    },
  ];
}

export function buildCampaignBenefits(settings: StoreSettings): CampaignBenefit[] {
  return [
    {
      id: "instant",
      icon: "instant",
      label: "Credit drops right after a friend’s order confirms",
    },
    {
      id: "wallet",
      icon: "wallet",
      label: "Wallet meal credit never expires",
    },
    {
      id: "repeat",
      icon: "repeat",
      label: "Keep sharing to earn more credit",
    },
    {
      id: "meal",
      icon: "meal",
      label: settings.featured_goal_enabled
        ? `Unlock ${settings.featured_meal_title}`
        : "Spend your balance freely at checkout",
    },
  ];
}

export function buildCampaignInviteUrl(origin: string, inviteCode: string): string {
  const safeOrigin = (origin || "https://prechop.com").replace(/\/+$/, "");
  return `${safeOrigin}/?ref=${encodeURIComponent(inviteCode)}`;
}

export type CampaignGoalMode = "locked" | "unlocked";

export type FeaturedMealGoal = {
  id: string;
  name: string;
  image: string;
  imageAlt: string;
  targetReferrals: number;
};

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

export type CampaignMockConfig = {
  mode: CampaignGoalMode;
  inviteCode: string;
  rewardPerReferralNgn: number;
  linkVisits: number;
  successfulReferrals: number;
  featuredMeal: FeaturedMealGoal;
  steps: CampaignHowItWorksStep[];
  benefits: CampaignBenefit[];
};

export type CampaignProgressMetrics = {
  targetReferrals: number;
  linkVisits: number;
  successfulReferrals: number;
  progressPercent: number;
  remainingReferrals: number;
  isUnlocked: boolean;
  availableCreditNgn: number;
};

const sharedFeaturedMeal: FeaturedMealGoal = {
  id: "jollof",
  name: "Jollof Rice & Chicken",
  image: "/images/jollof.png",
  imageAlt: "PreChop smoky jollof rice bowl",
  targetReferrals: 10,
};

const sharedSteps: CampaignHowItWorksStep[] = [
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
    description: "Your friend orders on PreChop and completes their first order.",
  },
  {
    id: "reward",
    icon: "reward",
    title: "You earn credit",
    description: "Get meal credit in your wallet after their order is confirmed.",
  },
];

const sharedBenefits: CampaignBenefit[] = [
  {
    id: "instant",
    icon: "instant",
    label: "Instant credit after each qualified order",
  },
  {
    id: "wallet",
    icon: "wallet",
    label: "Use your credit at checkout",
  },
  {
    id: "repeat",
    icon: "repeat",
    label: "Keep referring and earn more",
  },
  {
    id: "meal",
    icon: "meal",
    label: "Work toward featured meals",
  },
];

export const campaignMockPresets: Record<CampaignGoalMode, CampaignMockConfig> = {
  locked: {
    mode: "locked",
    inviteCode: "abu-samaru-4x7k",
    rewardPerReferralNgn: 500,
    linkVisits: 28,
    successfulReferrals: 4,
    featuredMeal: sharedFeaturedMeal,
    steps: sharedSteps,
    benefits: sharedBenefits,
  },
  unlocked: {
    mode: "unlocked",
    inviteCode: "abu-samaru-4x7k",
    rewardPerReferralNgn: 500,
    linkVisits: 64,
    successfulReferrals: 10,
    featuredMeal: sharedFeaturedMeal,
    steps: sharedSteps,
    benefits: sharedBenefits,
  },
};

export function computeCampaignProgress(
  config: Pick<
    CampaignMockConfig,
    "rewardPerReferralNgn" | "linkVisits" | "successfulReferrals" | "featuredMeal"
  >,
): CampaignProgressMetrics {
  const targetReferrals = Math.max(1, config.featuredMeal.targetReferrals);
  const successfulReferrals = Math.max(0, config.successfulReferrals);
  const linkVisits = Math.max(successfulReferrals, Math.max(0, config.linkVisits));
  const progressPercent = Math.min(
    100,
    Math.round((successfulReferrals / targetReferrals) * 100),
  );
  const remainingReferrals = Math.max(0, targetReferrals - successfulReferrals);
  const isUnlocked = successfulReferrals >= targetReferrals;
  const availableCreditNgn =
    successfulReferrals * Math.max(0, config.rewardPerReferralNgn);

  return {
    targetReferrals,
    linkVisits,
    successfulReferrals,
    progressPercent,
    remainingReferrals,
    isUnlocked,
    availableCreditNgn,
  };
}

export function buildCampaignInviteUrl(origin: string, inviteCode: string): string {
  const safeOrigin = (origin || "https://prechop.com").replace(/\/+$/, "");
  return `${safeOrigin}/?ref=${encodeURIComponent(inviteCode)}`;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCampaignSteps,
  evaluateCampaignGoalProgress,
} from '../src/lib/campaign.ts';
import {
  buildCampaignInviteUrl,
  campaignMockPresets,
  computeCampaignProgress,
} from '../src/lib/campaign-mock.ts';
import { defaultStoreSettings } from '../src/lib/settings.ts';

test('computeCampaignProgress calculates locked state percentages and credit accurately', () => {
  const locked = computeCampaignProgress(campaignMockPresets.locked);
  assert.equal(locked.linkVisits, 28);
  assert.equal(locked.successfulReferrals, 4);
  assert.equal(locked.targetReferrals, 10);
  assert.equal(locked.progressPercent, 40);
  assert.equal(locked.remainingReferrals, 6);
  assert.equal(locked.isUnlocked, false);
  assert.equal(locked.availableCreditNgn, 2000);
});

test('computeCampaignProgress calculates unlocked state cleanly and clamps above 100%', () => {
  const unlocked = computeCampaignProgress(campaignMockPresets.unlocked);
  assert.equal(unlocked.linkVisits, 64);
  assert.equal(unlocked.successfulReferrals, 10);
  assert.equal(unlocked.progressPercent, 100);
  assert.equal(unlocked.remainingReferrals, 0);
  assert.equal(unlocked.isUnlocked, true);
  assert.equal(unlocked.availableCreditNgn, 5000);

  const overGoal = computeCampaignProgress({
    ...campaignMockPresets.unlocked,
    successfulReferrals: 14,
  });
  assert.equal(overGoal.progressPercent, 100);
  assert.equal(overGoal.remainingReferrals, 0);
  assert.equal(overGoal.isUnlocked, true);
  assert.equal(overGoal.availableCreditNgn, 7000);
});

test('evaluateCampaignGoalProgress supports referral_count, accumulated_credit, and both rules', () => {
  const countRule = evaluateCampaignGoalProgress({
    unlockRule: 'referral_count',
    claimBehavior: 'consumes_credit',
    targetReferrals: 4,
    targetCreditNgn: 2000,
    qualifiedReferrals: 4,
    accumulatedCreditNgn: 1200,
  });
  assert.equal(countRule.isUnlocked, true);
  assert.equal(countRule.progressPercent, 100);

  const creditRuleLocked = evaluateCampaignGoalProgress({
    unlockRule: 'accumulated_credit',
    claimBehavior: 'bonus_free_claim',
    targetReferrals: 4,
    targetCreditNgn: 2500,
    qualifiedReferrals: 4,
    accumulatedCreditNgn: 2000,
  });
  assert.equal(creditRuleLocked.isUnlocked, false);
  assert.equal(creditRuleLocked.progressPercent, 80);
  assert.equal(creditRuleLocked.remainingCreditNgn, 500);

  const bothPartial = evaluateCampaignGoalProgress({
    unlockRule: 'both',
    claimBehavior: 'consumes_credit',
    targetReferrals: 4,
    targetCreditNgn: 2000,
    qualifiedReferrals: 4,
    accumulatedCreditNgn: 1500,
  });
  assert.equal(bothPartial.isUnlocked, false);
  assert.equal(bothPartial.progressPercent, 88);

  const bothUnlocked = evaluateCampaignGoalProgress({
    unlockRule: 'both',
    claimBehavior: 'bonus_free_claim',
    targetReferrals: 4,
    targetCreditNgn: 2000,
    qualifiedReferrals: 4,
    accumulatedCreditNgn: 2000,
  });
  assert.equal(bothUnlocked.isUnlocked, true);
  assert.equal(bothUnlocked.progressPercent, 100);
});

test('buildCampaignSteps reflects min_qualifying_order_ngn and featured_goal_enabled toggle', () => {
  const withFeatured = buildCampaignSteps({
    ...defaultStoreSettings,
    min_qualifying_order_ngn: 2000,
    reward_per_referral_ngn: 500,
    featured_goal_enabled: true,
  });
  assert.match(withFeatured[1].description, /₦2,000/);
  assert.match(withFeatured[2].description, /₦500/);
  assert.match(withFeatured[2].description, /featured meal goal/i);

  const walletOnly = buildCampaignSteps({
    ...defaultStoreSettings,
    min_qualifying_order_ngn: 0,
    reward_per_referral_ngn: 750,
    featured_goal_enabled: false,
  });
  assert.doesNotMatch(walletOnly[1].description, /at least/);
  assert.match(walletOnly[2].description, /use it anytime/i);
});

test('buildCampaignInviteUrl strips trailing slash and encodes invite code', () => {
  assert.equal(
    buildCampaignInviteUrl('https://prechop.com/', 'abu samaru'),
    'https://prechop.com/?ref=abu%20samaru',
  );
  assert.equal(
    buildCampaignInviteUrl('', 'abu-samaru-4x7k'),
    'https://prechop.com/?ref=abu-samaru-4x7k',
  );
});

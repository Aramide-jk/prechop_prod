import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultStoreSettings,
  isCampaignLive,
  parseOptionalTimestamp,
  parseStoreSettings,
} from '../src/lib/settings.ts';

test('parseStoreSettings returns defaultStoreSettings when input is null or undefined', () => {
  assert.equal(defaultStoreSettings.business_name, "PreChop");
  const resultNull = parseStoreSettings(null);
  assert.equal(resultNull.business_name, 'PreChop');
  assert.equal(resultNull.service_active, true);
  assert.equal(resultNull.min_order_amount_ngn, 0);
  assert.equal(resultNull.reward_per_referral_ngn, 500);
  assert.equal(resultNull.min_qualifying_order_ngn, 1500);
  assert.equal(resultNull.featured_goal_enabled, true);
  assert.equal(resultNull.featured_meal_slug, 'jollof');
  assert.equal(resultNull.featured_unlock_rule, 'both');
  assert.equal(resultNull.featured_claim_behavior, 'consumes_credit');

  const resultUndefined = parseStoreSettings(undefined);
  assert.equal(resultUndefined.whatsapp_number, '+2348031234567');
});

test('parseStoreSettings accurately parses custom operational and campaign settings', () => {
  const custom = {
    service_active: false,
    service_paused_message: 'Kitchen is undergoing deep sanitization today.',
    allow_same_day_ordering: false,
    advance_order_days: 14,
    min_order_amount_ngn: 2500,
    max_plates_per_order: 15,
    free_delivery_threshold_ngn: 10000,
    whatsapp_number: '+2348011112222',
    support_email: 'care@prechop.com',
    dispatch_phone: '+2348099998888',
    support_hours: 'Daily: 8am - 6pm',
    announcement_banner: '20% off all jollof orders this Friday!',
    business_name: 'PreChop Kitchens',
    service_area_tagline: 'Zaria & Kaduna Express',
    footer_tagline: 'Freshly pre-ordered everyday.',
    enabled: true,
    referrals_required: 3,
    reward_amount_ngn: 2000,
    campaign_starts_at: '2026-11-01T08:00:00.000Z',
    campaign_ends_at: '2026-11-30T23:59:00.000Z',
    reward_per_referral_ngn: 600,
    min_qualifying_order_ngn: 0,
    featured_goal_enabled: false,
    featured_meal_slug: 'beans',
    featured_meal_title: 'Honey Beans & Plantain',
    featured_meal_image: '/images/beans.png',
    featured_unlock_rule: 'accumulated_credit',
    featured_target_referrals: 6,
    featured_target_credit_ngn: 3000,
    featured_claim_behavior: 'bonus_free_claim',
    featured_claim_expiry_days: 7,
    delivery_enabled: false,
    pickup_enabled: true,
    pickup_station_name: 'ABU Social Center Hub',
    pickup_station_address: 'Opposite Gymnasium, Social Center, Samaru Campus',
    pickup_instructions: 'Ask for PreChop attendant Amina at the central desk.',
    pickup_holding_minutes: 60,
    pickup_unclaimed_policy: 'Orders held for 60 mins only.',
    pickup_delivery_reroute_enabled: false,
  };

  const parsed = parseStoreSettings(custom);

  assert.equal(parsed.service_active, false);
  assert.equal(parsed.service_paused_message, 'Kitchen is undergoing deep sanitization today.');
  assert.equal(parsed.allow_same_day_ordering, false);
  assert.equal(parsed.advance_order_days, 14);
  assert.equal(parsed.min_order_amount_ngn, 2500);
  assert.equal(parsed.max_plates_per_order, 15);
  assert.equal(parsed.free_delivery_threshold_ngn, 10000);
  assert.equal(parsed.whatsapp_number, '+2348011112222');
  assert.equal(parsed.support_email, 'care@prechop.com');
  assert.equal(parsed.announcement_banner, '20% off all jollof orders this Friday!');
  assert.equal(parsed.referrals_required, 3);
  assert.equal(parsed.reward_amount_ngn, 2000);
  assert.equal(parsed.campaign_starts_at, '2026-11-01T08:00:00.000Z');
  assert.equal(parsed.campaign_ends_at, '2026-11-30T23:59:00.000Z');
  assert.equal(parsed.reward_per_referral_ngn, 600);
  assert.equal(parsed.min_qualifying_order_ngn, 0);
  assert.equal(parsed.featured_goal_enabled, false);
  assert.equal(parsed.featured_meal_slug, 'beans');
  assert.equal(parsed.featured_meal_title, 'Honey Beans & Plantain');
  assert.equal(parsed.featured_unlock_rule, 'accumulated_credit');
  assert.equal(parsed.featured_target_referrals, 6);
  assert.equal(parsed.featured_target_credit_ngn, 3000);
  assert.equal(parsed.featured_claim_behavior, 'bonus_free_claim');
  assert.equal(parsed.featured_claim_expiry_days, 7);
  assert.equal(parsed.delivery_enabled, false);
  assert.equal(parsed.pickup_enabled, true);
  assert.equal(parsed.pickup_station_name, 'ABU Social Center Hub');
  assert.equal(parsed.pickup_holding_minutes, 60);
  assert.equal(parsed.pickup_delivery_reroute_enabled, false);
});

test('isCampaignLive enforces master flag and optional start/end window', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');

  assert.equal(
    isCampaignLive({ referral_campaign_enabled: false, campaign_starts_at: null, campaign_ends_at: null }, now),
    false,
  );
  assert.equal(
    isCampaignLive({ referral_campaign_enabled: true, campaign_starts_at: null, campaign_ends_at: null }, now),
    true,
  );
  assert.equal(
    isCampaignLive(
      {
        referral_campaign_enabled: true,
        campaign_starts_at: '2026-11-20T00:00:00.000Z',
        campaign_ends_at: null,
      },
      now,
    ),
    false,
  );
  assert.equal(
    isCampaignLive(
      {
        referral_campaign_enabled: true,
        campaign_starts_at: '2026-11-01T00:00:00.000Z',
        campaign_ends_at: '2026-11-10T00:00:00.000Z',
      },
      now,
    ),
    false,
  );
  assert.equal(
    isCampaignLive(
      {
        referral_campaign_enabled: true,
        campaign_starts_at: '2026-11-01T00:00:00.000Z',
        campaign_ends_at: '2026-11-30T00:00:00.000Z',
      },
      now,
    ),
    true,
  );
  assert.equal(parseOptionalTimestamp('not-a-date'), null);
});

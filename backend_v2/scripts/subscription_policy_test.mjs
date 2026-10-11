import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

process.env.TABLE_SUBSCRIPTIONS = 'test-subscriptions';
process.env.TABLE_DOCTOR_PAYOUTS = 'test-payouts';
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const { validateSubscriptionPolicy, calculateDiscountedPrice, calculateShares } = require('./dist/shared/subscription.js');
const policy = JSON.parse(await readFile(new URL('../shared/content/subscription.json', import.meta.url), 'utf8'));

test('maintained pricing preserves the existing discount and payout contracts', () => {
  assert.equal(calculateDiscountedPrice(100, 'plus').discountedPrice, 80);
  assert.equal(calculateDiscountedPrice(100, 'premium').discountedPrice, 70);
  const shares = calculateShares(100, 'established');
  assert.equal(shares.doctorShare, 85); assert.equal(shares.platformShare, 15);
});

test('malformed, incomplete and inconsistent pricing data fails closed', () => {
  for (const change of [
    value => { delete value.PLANS.plus; },
    value => { value.PLANS.plus.planId = 'premium'; },
    value => { value.PLANS.plus.priceMonthly = -1; },
    value => { value.PLANS.plus.discountPercent = 101; },
    value => { delete value.DOCTOR_TIERS.top; },
    value => { value.DOCTOR_TIERS.top.platformPercentage = 99; },
    value => { value.PAYOUT_HOLD_DAYS = -1; },
  ]) {
    const value = structuredClone(policy); change(value);
    assert.throws(() => validateSubscriptionPolicy(value));
  }
});

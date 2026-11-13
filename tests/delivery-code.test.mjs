import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDisplayAddress,
  formatPackCode,
  formatPackCodeList,
  formatPackCodeSummary,
  formatShortOrderRef,
} from '../src/lib/delivery-code.ts';

test('formatPackCode formats positive integers with PC prefix', () => {
  assert.equal(formatPackCode(1001), 'PC1001');
  assert.equal(formatPackCode(1042), 'PC1042');
  assert.equal(formatPackCode(10005), 'PC10005');
  assert.equal(formatPackCode(null), '');
  assert.equal(formatPackCode(0), '');
  assert.equal(formatPackCode(-5), '');
});

test('formatPackCodeSummary handles single, pair, contiguous range, and split packs', () => {
  assert.equal(formatPackCodeSummary([]), '');
  assert.equal(formatPackCodeSummary([1001]), 'PC1001');
  assert.equal(formatPackCodeSummary([1002, 1001]), 'PC1001 · PC1002');
  assert.equal(formatPackCodeSummary([1003, 1001, 1002]), 'PC1001–PC1003');
  assert.equal(formatPackCodeSummary([1001, 1003, 1006]), 'PC1001, PC1003 +1');
  assert.deepEqual(formatPackCodeList([1003, 1001, 1003]), ['PC1001', 'PC1003']);
});

test('formatShortOrderRef shortens Paystack UUID references cleanly', () => {
  assert.equal(
    formatShortOrderRef('prechop-65f9c765-17ec-444d-9862-8ecc6fb0fcfb', 'uuid'),
    '#65F9C7',
  );
  assert.equal(formatShortOrderRef('DEMO-104'), 'DEMO-104');
  assert.equal(formatShortOrderRef(null, 'a1b2c3d4-0000-0000'), '#A1B2C3');
});

test('formatDisplayAddress trims whitespace and capitalizes lowercase start', () => {
  assert.equal(formatDisplayAddress('  home   junctions '), 'Home junctions');
  assert.equal(formatDisplayAddress('ABU Samaru campus'), 'ABU Samaru campus');
});

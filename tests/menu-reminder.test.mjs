import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  mondayOf,
  getWeekRange,
  getNextWeekRange,
  buildMenuReminderMessage,
} from '../src/lib/menu-calendar.ts';

test('addDays adds positive and negative days across months accurately', () => {
  assert.equal(addDays('2026-11-15', 1), '2026-11-16');
  assert.equal(addDays('2026-11-15', 7), '2026-11-22');
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('mondayOf correctly resolves the Monday of any given date', () => {
  // 2026-11-15 is a Sunday
  assert.equal(mondayOf('2026-11-15'), '2026-11-09');
  // 2026-11-16 is a Monday
  assert.equal(mondayOf('2026-11-16'), '2026-11-16');
  // 2026-11-20 is a Friday
  assert.equal(mondayOf('2026-11-20'), '2026-11-16');
  // 2026-11-21 is Saturday (reminder day)
  assert.equal(mondayOf('2026-11-21'), '2026-11-16');
});

test('getNextWeekRange returns the upcoming Monday to Sunday', () => {
  const thisWeek = getWeekRange('2026-11-21');
  assert.equal(thisWeek.start, '2026-11-16');
  assert.equal(thisWeek.end, '2026-11-22');

  // On Saturday 2026-11-21:
  const nextWeek = getNextWeekRange('2026-11-21');
  assert.equal(nextWeek.start, '2026-11-23'); // Next Monday
  assert.equal(nextWeek.end, '2026-11-29');   // Next Sunday
  assert.equal(Date.parse(nextWeek.end) - Date.parse(nextWeek.start), 6 * 86400000);
});

test('buildMenuReminderMessage includes date range, friendly greeting, and 1-click duplicate URL', () => {
  const message = buildMenuReminderMessage({
    startDate: '2026-11-23',
    endDate: '2026-11-29',
    url: 'https://prechop.com.ng/admin/menus?copy=next-week',
    siteName: 'PreChop',
  });

  assert.match(message, /👋 Hi PreChop Admin!/);
  assert.match(message, /Next week's menu/);
  assert.match(message, /23 Nov/);
  assert.match(message, /29 Nov/);
  assert.match(message, /https:\/\/prechop\.com\.ng\/admin\/menus\?copy=next-week/);
});

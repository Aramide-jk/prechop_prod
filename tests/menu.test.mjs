import test from 'node:test';
import assert from 'node:assert/strict';
import { plateTotal, addOnUsed, mealRemaining, readCart, upcomingDates } from '../src/lib/menu.ts';
import { windowClosed } from '../src/lib/delivery-slots.ts';

const plate = { id: 'one', mealId: 'jollof', date: '2026-09-29', window: 'Lunch', protein: 'chicken', extras: { chicken: 2, water: 1 } };
test('price includes base meal, protein and each extra', () => {
  assert.equal(plateTotal(plate), 4200);
  assert.equal(plateTotal({ ...plate, protein: 'none', extras: {} }), 1500);
});
test('protein and extras share global stock across days', () => {
  assert.equal(addOnUsed([plate, { ...plate, date: '2026-09-30' }], 'chicken'), 6);
});
test('shared meal portions count plates for that date only', () => {
  assert.equal(mealRemaining([plate, { ...plate, window: 'Dinner' }, { ...plate, date: '2026-09-30' }], 'jollof', plate.date), 28);
});
test('restoration rejects corrupt and unsupported selections', () => {
  assert.deepEqual(readCart('{bad'), []);
  assert.deepEqual(readCart(JSON.stringify([null, { ...plate, extras: { water: -1 } }, { ...plate, protein: 'invalid' }])), []);
  assert.deepEqual(readCart(JSON.stringify([plate, plate])), [plate]);
});
test('restoration cannot exceed global extras stock', () => {
  const plates = Array.from({ length: 12 }, (_, i) => ({ ...plate, id: String(i) }));
  assert.equal(readCart(JSON.stringify(plates)).length, 8);
});
test('calendar provides seven consecutive dates', () => {
  const dates = upcomingDates();
  assert.equal(dates.length, 7);
  assert.equal(Date.parse(dates[6]) - Date.parse(dates[0]), 6 * 86400000);
});
test('windowClosed respects live batch cutoffs over static defaults', () => {
  const sevenPmLagos = Date.parse('2026-11-11T19:52:00+01:00');
  // Static sample dinner closes at 16:00, so without customCutoffs 19:52 is closed:
  assert.equal(windowClosed('2026-11-11', 'Dinner', sevenPmLagos), true);
  // With live 20:10 dinner batch cutoff, 19:52 is still OPEN:
  assert.equal(windowClosed('2026-11-11', 'Dinner', sevenPmLagos, ['20:10']), false);
  // Once 20:15 arrives, 20:10 batch closes:
  const afterCutoff = Date.parse('2026-11-11T20:15:00+01:00');
  assert.equal(windowClosed('2026-11-11', 'Dinner', afterCutoff, ['20:10']), true);
  // Empty customCutoffs means no active batches for that slot -> closed:
  assert.equal(windowClosed('2026-11-11', 'Dinner', sevenPmLagos, []), true);
});

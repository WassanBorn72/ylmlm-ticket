import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, shiftMonth } from '../src/calendar.mjs';
test('カレンダーは日曜始まりで31日ある月と6行必要な月を配置する', () => {
  const days = calendarDays('2026-08');
  assert.equal(days.length, 42);
  assert.equal(days[6], '2026-08-01');
  assert.equal(days[36], '2026-08-31');
  assert.equal(days.filter(Boolean).length, 31);
});
test('2月は閏年と通常年の最終日を区別する', () => {
  assert.equal(calendarDays('2028-02').filter(Boolean).at(-1), '2028-02-29');
  assert.equal(calendarDays('2027-02').filter(Boolean).at(-1), '2027-02-28');
  assert.equal(calendarDays('2100-02').filter(Boolean).length, 28);
});
test('前後の月の操作は年境界をまたぐ', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
});

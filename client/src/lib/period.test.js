import { describe, expect, test } from 'vitest';
import { addMonths, periodOf, periodRange, todayIn } from './period.js';

// نفس حالات server/test/utils.test.js: الواجهة والسيرفر لازم يتفقوا على حدود الشهر
describe('الشهر المالي', () => {
  test('بداية يوم 1 = الشهر التقويمي', () => {
    expect(periodRange('2026-10', 1)).toEqual({ month: '2026-10', from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('2028-02', 1).to).toBe('2028-02-29');
  });

  test('بداية يوم 25 تعبر السنة', () => {
    expect(periodRange('2026-12', 25)).toEqual({ month: '2026-12', from: '2026-12-25', to: '2027-01-24' });
  });

  test('periodOf قبل يوم البداية يتبع الشهر السابق', () => {
    expect(periodOf('2026-10-24', 25)).toBe('2026-09');
    expect(periodOf('2026-10-25', 25)).toBe('2026-10');
    expect(periodOf('2027-01-03', 25)).toBe('2026-12');
  });

  test('addMonths في الاتجاهين', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  test('todayIn يحترم المنطقة الزمنية', () => {
    // 23:30 بتوقيت جرينتش = اليوم التالي في القاهرة
    const instant = new Date('2026-07-14T23:30:00Z');
    expect(todayIn('UTC', instant)).toBe('2026-07-14');
    expect(todayIn('Africa/Cairo', instant)).toBe('2026-07-15');
  });
});

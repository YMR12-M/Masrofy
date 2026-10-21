import { describe, expect, test } from 'vitest';
import {
  addMonthsClamped, daysText, describeSchedule, dueLabel, installmentLabel, installmentsText, postVerb, splitInstallments,
} from './bills.js';

describe('نصوص الفواتير', () => {
  test('العدد بالعامية', () => {
    expect([1, 2, 3, 10, 11, 30].map(daysText)).toEqual(['يوم', 'يومين', '3 أيام', '10 أيام', '11 يوم', '30 يوم']);
  });

  test('وصف التكرار', () => {
    expect(describeSchedule({ frequency: 'monthly', interval_count: 1, start_on: '2027-01-31' })).toBe('كل شهر يوم 31');
    expect(describeSchedule({ frequency: 'monthly', interval_count: 3, start_on: '2026-11-05' })).toBe('كل 3 شهور يوم 5');
    expect(describeSchedule({ frequency: 'weekly', interval_count: 2, start_on: '2026-10-22' })).toBe('كل أسبوعين يوم الخميس');
    expect(describeSchedule({ frequency: 'yearly', interval_count: 1, start_on: '2028-02-29' })).toMatch(/^كل سنة يوم 29 /);
  });

  test('المعاد بالنسبة للنهارده', () => {
    const today = '2026-10-19';
    expect(dueLabel('2026-10-19', today)).toBe('النهارده');
    expect(dueLabel('2026-10-20', today)).toBe('بكره');
    expect(dueLabel('2026-10-18', today)).toBe('امبارح');
    expect(dueLabel('2026-10-21', today)).toBe('بعد يومين');
    expect(dueLabel('2026-10-14', today)).toBe('من 5 أيام');
    expect(dueLabel('2026-11-30', today)).toBe('بعد 42 يوم');
  });

  test('القسط والفعل', () => {
    expect(installmentLabel({ seq: 0, count: 6 })).toBe('المقدّم');
    expect(installmentLabel({ seq: 3, count: 10 })).toBe('قسط 3 من 10');
    expect([postVerb('expense'), postVerb('income'), postVerb('transfer')]).toEqual(['دفعت', 'اتقبض', 'اتحوّل']);
  });
});

// نفس حالات server/test/schedule.test.js (جدول التقسيط)
describe('قسمة التقسيط', () => {
  test('الأقساط متساوية والأخير ياخد الباقي', () => {
    expect(splitInstallments(1_000_000, 100_000, 7)).toEqual({ base: 128_571, last: 128_574 });
    expect(splitInstallments(300, 0, 3)).toEqual({ base: 100, last: 100 });
  });

  test('آخر قسط بعد n شهر مقصوص على آخر الشهر', () => {
    expect(addMonthsClamped('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonthsClamped('2026-10-19', 11)).toBe('2027-09-19');
    expect([1, 2, 6, 12].map(installmentsText)).toEqual(['قسط', 'قسطين', '6 أقساط', '12 قسط']);
  });

  test('مدخلات لا تكوّن جدولًا', () => {
    expect(splitInstallments(1_000, 1_000, 2)).toBeNull();
    expect(splitInstallments(5, 0, 6)).toBeNull();
    expect(splitInstallments(null, 0, 6)).toBeNull();
  });
});

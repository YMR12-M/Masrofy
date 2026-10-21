import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysInMonth, indexOnOrAfter, nextPending, occurrenceAt, occurrenceIndex, occurrencesBetween, remainingCount,
} from '../src/modules/recurring/schedule.js';
import { buildSchedule } from '../src/modules/installments/installments.service.js';

const monthly = (start, extra = {}) => ({ frequency: 'monthly', interval_count: 1, start_on: start, ...extra });
const dates = (rule, count) => Array.from({ length: count }, (_, n) => occurrenceAt(rule, n));

describe('مواعيد آخر الشهر', () => {
  test('الشهري يوم 31 يُقصّ على آخر الشهر ثم يرجع 31 — بلا انجراف', () => {
    assert.deepEqual(dates(monthly('2027-01-31'), 5), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
  });

  test('فبراير الكبيسة 29، والبسيطة 28', () => {
    assert.equal(occurrenceAt(monthly('2028-01-31'), 1), '2028-02-29');
    assert.equal(occurrenceAt(monthly('2028-01-30'), 1), '2028-02-29');
    assert.equal(occurrenceAt(monthly('2027-01-29'), 1), '2027-02-28');
    assert.equal(daysInMonth('2100-02'), 28); // 2100 مش كبيسة (تقبل القسمة على 100 لا 400)
    assert.equal(daysInMonth('2000-02'), 29);
  });

  test('كل 3 شهور يوم 30 تعبر فبراير والسنة', () => {
    assert.deepEqual(dates(monthly('2026-11-30', { interval_count: 3 }), 3), ['2026-11-30', '2027-02-28', '2027-05-30']);
  });

  test('السنوي يوم 29 فبراير: 28 في السنين البسيطة و29 في الكبيسة', () => {
    const rule = { frequency: 'yearly', interval_count: 1, start_on: '2028-02-29' };
    assert.deepEqual(dates(rule, 5), ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  });

  test('الأسبوعي وكل أسبوعين يعبرون آخر الشهر والسنة', () => {
    assert.deepEqual(dates({ frequency: 'weekly', interval_count: 2, start_on: '2026-12-24' }, 3), ['2026-12-24', '2027-01-07', '2027-01-21']);
  });
});

describe('البحث في المواعيد', () => {
  const rule = monthly('2027-01-31');

  test('occurrenceIndex يعرف المعاد المقصوص ويرفض غيره', () => {
    assert.equal(occurrenceIndex(rule, '2027-02-28'), 1);
    assert.equal(occurrenceIndex(rule, '2027-04-30'), 3);
    assert.equal(occurrenceIndex(rule, '2027-02-27'), -1);
    assert.equal(occurrenceIndex(rule, '2027-03-30'), -1);
    assert.equal(occurrenceIndex(rule, '2026-12-31'), -1); // قبل أول معاد
  });

  test('indexOnOrAfter: أول معاد في التاريخ أو بعده', () => {
    assert.equal(indexOnOrAfter(rule, '2020-01-01'), 0);
    assert.equal(indexOnOrAfter(rule, '2027-02-01'), 1);
    assert.equal(indexOnOrAfter(rule, '2027-03-01'), 2);
    assert.equal(indexOnOrAfter({ frequency: 'weekly', interval_count: 1, start_on: '2026-10-01' }, '2026-10-09'), 2);
  });

  test('النهاية بعدد المرات أو بتاريخ — أيّهما أسبق', () => {
    assert.equal(occurrencesBetween(monthly('2027-01-31', { total_count: 3 }), { to: '2030-01-01' }).length, 3);
    const byDate = occurrencesBetween(monthly('2027-01-31', { end_on: '2027-04-29' }), { to: '2030-01-01' });
    assert.deepEqual(byDate.map((item) => item.due_on), ['2027-01-31', '2027-02-28', '2027-03-31']);
    assert.equal(occurrenceIndex(monthly('2027-01-31', { total_count: 2 }), '2027-03-31'), -1);
  });

  test('nextPending يتخطّى ما اتعمل، وnull لما القاعدة تخلص', () => {
    const limited = monthly('2027-01-31', { total_count: 3 });
    assert.equal(nextPending(limited, new Set(['2027-01-31'])).due_on, '2027-02-28');
    // المتعمل بره الترتيب لا يغطي اللي قبله
    assert.equal(nextPending(limited, new Set(['2027-02-28'])).due_on, '2027-01-31');
    assert.equal(nextPending(limited, new Set(['2027-01-31', '2027-02-28', '2027-03-31'])), null);
    assert.equal(remainingCount(limited, new Set(['2027-01-31'])), 2);
    assert.equal(remainingCount(monthly('2027-01-31')), null);
  });
});

describe('جدول التقسيط', () => {
  test('الأقساط متساوية والأخير ياخد الباقي — والمجموع = الإجمالي بالقرش', () => {
    const items = buildSchedule({
      total_minor: 1_000_000, down_payment_minor: 100_000, installment_count: 7, purchase_on: '2027-01-15', first_due_on: '2027-01-31',
    });
    assert.equal(items.length, 8);
    assert.deepEqual(items[0], { seq: 0, due_on: '2027-01-15', amount_minor: 100_000 });
    assert.deepEqual(items.slice(1, 7).map((item) => item.amount_minor), Array(6).fill(128_571));
    assert.equal(items[7].amount_minor, 128_574);
    assert.equal(items.reduce((sum, item) => sum + item.amount_minor, 0), 1_000_000);
    assert.deepEqual(items.slice(1, 4).map((item) => item.due_on), ['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  test('بلا مقدّم لا يوجد صف 0', () => {
    const items = buildSchedule({ total_minor: 300, installment_count: 3, purchase_on: '2028-01-31', first_due_on: '2028-01-31' });
    assert.deepEqual(items.map((item) => [item.seq, item.due_on, item.amount_minor]), [
      [1, '2028-01-31', 100], [2, '2028-02-29', 100], [3, '2028-03-31', 100],
    ]);
  });
});

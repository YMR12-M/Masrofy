import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, isValidIso, periodOf, periodRange,
} from '../src/utils/dates.js';
import { toCsv, money } from '../src/utils/csv.js';
import { passwordIssues } from '../src/utils/security.js';
import { normalizePhone } from '../src/utils/phone.js';
import { ratioBps } from '../src/utils/money.js';

describe('الشهر المالي', () => {
  test('بداية يوم 1 = الشهر التقويمي، شاملًا فبراير الكبيسة', () => {
    assert.deepEqual(periodRange('2026-10', 1), { month: '2026-10', from: '2026-10-01', to: '2026-10-31' });
    assert.deepEqual(periodRange('2028-02', 1), { month: '2028-02', from: '2028-02-01', to: '2028-02-29' });
  });

  test('بداية يوم 25: الفترة تُسمّى بشهر بدايتها وتعبر السنة', () => {
    assert.deepEqual(periodRange('2026-12', 25), { month: '2026-12', from: '2026-12-25', to: '2027-01-24' });
  });

  test('periodOf: قبل يوم البداية يتبع الشهر السابق', () => {
    assert.equal(periodOf('2026-10-24', 25), '2026-09');
    assert.equal(periodOf('2026-10-25', 25), '2026-10');
    assert.equal(periodOf('2027-01-03', 25), '2026-12');
    assert.equal(periodOf('2026-10-01', 1), '2026-10');
  });

  test('addMonths عبر حدود السنة في الاتجاهين', () => {
    assert.equal(addMonths('2026-11', 3), '2027-02');
    assert.equal(addMonths('2026-01', -1), '2025-12');
    assert.equal(addMonths('2026-01', -13), '2024-12');
  });

  test('isValidIso يرفض التواريخ المستحيلة', () => {
    assert.equal(isValidIso('2026-02-31'), false);
    assert.equal(isValidIso('2026-2-3'), false);
    assert.equal(isValidIso('2028-02-29'), true);
  });
});

describe('CSV', () => {
  test('BOM + هروب الفواصل والاقتباس + حماية من حقن الصيغ', () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'نص, بفاصلة', c: -1250 }], [
      { header: 'أ', value: (row) => row.a },
      { header: 'ب', value: (row) => row.b },
      { header: 'ج', value: (row) => row.c },
    ]);
    assert.ok(csv.startsWith('﻿'));
    const line = csv.split('\r\n')[1];
    assert.equal(line, `"'=HYPERLINK(""x"")","نص, بفاصلة",-1250`);
  });

  test('money: قروش ← جنيه بخانتين كرقم', () => {
    assert.equal(money(123456), 1234.56);
    assert.equal(money(-50), -0.5);
    assert.equal(money(null), null);
  });
});

describe('أدوات أخرى', () => {
  test('كلمات المرور الضعيفة مرفوضة بأسباب مفهومة', () => {
    assert.ok(passwordIssues('short').length > 0);
    assert.ok(passwordIssues('12345678').length > 0);
    assert.deepEqual(passwordIssues('Str0ng-Pass-123!'), []);
  });

  test('توحيد الأرقام المصرية', () => {
    assert.equal(normalizePhone('01012345678'), '+201012345678');
    assert.equal(normalizePhone('0020 101 234 5678'), '+201012345678');
    assert.equal(normalizePhone(''), null);
  });

  test('ratioBps: صفر لو المقام صفر', () => {
    assert.equal(ratioBps(50, 200), 2500);
    assert.equal(ratioBps(50, 0), 0);
  });
});

import { describe, expect, test } from 'vitest';
import {
  formatBps, formatDayHeading, formatMoney, formatSigned, inputToMinor, minorToInput,
} from './format.js';
import { categoryTree } from './queries.js';

describe('إدخال المبالغ', () => {
  test('جنيه ← قروش صحيحة بلا أخطاء الكسور العشرية', () => {
    expect(inputToMinor('12.5')).toBe(1250);
    expect(inputToMinor('0.1')).toBe(10);
    expect(inputToMinor('19.99')).toBe(1999);
    expect(inputToMinor('1,250')).toBe(125000);
  });

  test('الأرقام العربية والفاصلة العشرية العربية', () => {
    expect(inputToMinor('١٢٫٥')).toBe(1250);
  });

  test('المرفوض: نص، أكثر من خانتين، والسالب إلا لو مسموح', () => {
    expect(inputToMinor('abc')).toBeNull();
    expect(inputToMinor('1.234')).toBeNull();
    expect(inputToMinor('-50')).toBeNull();
    expect(inputToMinor('-50', { allowNegative: true })).toBe(-5000);
    expect(inputToMinor('')).toBeNull();
  });

  test('قروش ← نص الحقل بلا أصفار زائدة', () => {
    expect(minorToInput(125000)).toBe('1250');
    expect(minorToInput(1250)).toBe('12.50');
    expect(minorToInput(null)).toBe('');
  });
});

describe('عرض المبالغ', () => {
  test('أرقام لاتينية وعملة، والسالب بلا علامات اتجاه مخفية', () => {
    const text = formatMoney(-123456);
    expect(text).toMatch(/1,234\.56/);
    expect(text).not.toMatch(/‎/);
  });

  test('compact يحذف القروش للمبالغ الصحيحة فقط', () => {
    expect(formatMoney(500000, 'EGP', { compact: true })).not.toMatch(/\.00/);
    expect(formatMoney(500050, 'EGP', { compact: true })).toMatch(/\.50/);
  });

  test('إشارة المصروف والدخل داخل النص العربي (بعد RLM) كي تلاصق الرقم', () => {
    expect(formatSigned(100, 'expense')).toMatch(/^‏?-1\.00/);
    expect(formatSigned(100, 'income')).toMatch(/^‏?\+1\.00/);
    expect(formatSigned(100, 'transfer')).not.toMatch(/[+-]/);
  });

  test('النسب من basis points', () => {
    expect(formatBps(8333)).toBe('83%');
    expect(formatBps(null)).toBe('—');
  });

  test('عناوين الأيام', () => {
    expect(formatDayHeading('2026-10-19', '2026-10-19')).toBe('النهارده');
    expect(formatDayHeading('2026-10-18', '2026-10-19')).toBe('امبارح');
  });
});

describe('شجرة التصنيفات', () => {
  test('الفروع تحت آبائها ونوع واحد فقط', () => {
    const tree = categoryTree([
      { id: 1, parent_id: null, kind: 'expense', name: 'أكل' },
      { id: 2, parent_id: 1, kind: 'expense', name: 'سوبرماركت' },
      { id: 3, parent_id: null, kind: 'income', name: 'مرتب' },
    ], 'expense');
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((child) => child.name)).toEqual(['سوبرماركت']);
  });
});

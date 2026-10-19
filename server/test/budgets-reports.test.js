import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, periodOf, periodRange } from '../src/utils/dates.js';
import {
  TODAY, addMember, categoryNamed, expectStatus, makeAccount, makeApp, mustRecord,
  registerHousehold, resetDatabase, shutdown,
} from './helpers.js';

const { http } = makeApp();
let owner;
let cash;
let food;
let supermarket;
let restaurants;
let transport;
let salary;

const MONTH = periodOf(TODAY, 1);
const { from: MONTH_START } = periodRange(MONTH, 1);

before(async () => {
  await resetDatabase();
  owner = await registerHousehold(http);
  cash = await makeAccount(owner.api, { name: 'كاش', opening_balance_minor: 1_000_000 });
  food = await categoryNamed(owner.api, 'أكل وشرب');
  supermarket = await categoryNamed(owner.api, 'سوبرماركت');
  restaurants = await categoryNamed(owner.api, 'مطاعم وكافيهات');
  transport = await categoryNamed(owner.api, 'مواصلات');
  salary = await categoryNamed(owner.api, 'مرتب');

  // كل العمليات في أول يوم من الشهر الحالي لتقع في نفس الفترة أيًّا كان اليوم
  const spend = (category, amount) => mustRecord(owner.api, {
    type: 'expense', account_id: cash.id, category_id: category.id, amount_minor: amount, occurred_on: MONTH_START,
  });
  await spend(supermarket, 300_000);
  await spend(restaurants, 150_000);
  await spend(transport, 90_000);
  await mustRecord(owner.api, { type: 'income', account_id: cash.id, category_id: salary.id, amount_minor: 2_000_000, occurred_on: MONTH_START });
  // تحويل لا يدخل الدخل ولا المصروف
  const bank = await makeAccount(owner.api, { name: 'بنك', type: 'bank' });
  await mustRecord(owner.api, { type: 'transfer', account_id: cash.id, to_account_id: bank.id, amount_minor: 500_000, occurred_on: MONTH_START });
  // مصروف الشهر الماضي للمقارنة
  await mustRecord(owner.api, {
    type: 'expense', account_id: cash.id, category_id: supermarket.id, amount_minor: 100_000,
    occurred_on: periodRange(addMonths(MONTH, -1), 1).from,
  });
});
after(shutdown);

describe('الميزانيات', () => {
  test('ميزانية الرئيسي تشمل فروعه، والحالة حسب حدّ التنبيه', async () => {
    expectStatus(await owner.api.post('/budgets', { category_id: food.id, amount_minor: 500_000 }), 201);
    expectStatus(await owner.api.post('/budgets', { category_id: transport.id, amount_minor: 80_000, alert_bps: 9000 }), 201);

    const { period, budgets } = expectStatus(await owner.api.get('/budgets', { month: MONTH }), 200);
    assert.equal(period.month, MONTH);
    assert.equal(period.from, MONTH_START);

    const foodBudget = budgets.find((budget) => budget.category_id === food.id);
    assert.equal(foodBudget.spent_minor, 450_000);
    assert.equal(foodBudget.used_bps, 9000);
    assert.equal(foodBudget.status, 'warning');
    assert.equal(foodBudget.remaining_minor, 50_000);

    const transportBudget = budgets.find((budget) => budget.category_id === transport.id);
    assert.equal(transportBudget.status, 'over');
    assert.equal(transportBudget.remaining_minor, -10_000);
  });

  test('ميزانية فرع تحت رئيسي له ميزانية لا تُحسب مرتين في الإجمالي', async () => {
    expectStatus(await owner.api.post('/budgets', { category_id: supermarket.id, amount_minor: 350_000 }), 201);
    const { totals } = expectStatus(await owner.api.get('/budgets', { month: MONTH }), 200);
    assert.equal(totals.amount_minor, 500_000 + 80_000);
    assert.equal(totals.spent_minor, 450_000 + 90_000);
  });

  test('ميزانية واحدة لكل تصنيف، وللمصروف فقط', async () => {
    const duplicate = await owner.api.post('/budgets', { category_id: food.id, amount_minor: 1 });
    assert.equal(duplicate.body.code, 'BUDGET_EXISTS');
    const income = await owner.api.post('/budgets', { category_id: salary.id, amount_minor: 1 });
    assert.equal(income.body.errors.category_id, 'الميزانية لتصنيفات المصروف بس');
  });

  test('الفرد يقرأ الميزانيات ولا يعدّلها، والابن لا يراها', async () => {
    const member = await addMember(http, owner.token, 'member');
    assert.equal((await member.api.get('/budgets')).status, 200);
    assert.equal((await member.api.post('/budgets', { category_id: transport.id, amount_minor: 1 })).status, 403);
    const child = await addMember(http, owner.token, 'child');
    assert.equal((await child.api.get('/budgets')).status, 403);
  });
});

describe('التقارير', () => {
  test('ملخّص الشهر: التحويلات خارج الحساب، والفروع مضمومة لأبيها', async () => {
    const summary = expectStatus(await owner.api.get('/reports/summary', { month: MONTH }), 200);
    assert.equal(summary.totals.income_minor, 2_000_000);
    assert.equal(summary.totals.expense_minor, 540_000);
    assert.equal(summary.totals.net_minor, 1_460_000);
    assert.equal(summary.totals.savings_rate_bps, 7300);
    assert.equal(summary.previous.expense_minor, 100_000);

    const [top, second] = summary.by_category.expense;
    assert.equal(top.name, 'أكل وشرب');
    assert.equal(top.amount_minor, 450_000);
    assert.equal(top.share_bps, 8333);
    assert.equal(second.name, 'مواصلات');

    const firstDay = summary.daily.find((item) => item.date === MONTH_START);
    assert.equal(firstDay.expense_minor, 540_000);
    assert.equal(summary.daily.length, summary.period.days);
  });

  test('الاتجاه: شهور متتالية الأقدم أولًا', async () => {
    const trend = expectStatus(await owner.api.get('/reports/trend', { months: 3, end: MONTH }), 200);
    assert.deepEqual(trend.map((item) => item.month), [addMonths(MONTH, -2), addMonths(MONTH, -1), MONTH]);
    assert.equal(trend[1].expense_minor, 100_000);
    assert.equal(trend[2].income_minor, 2_000_000);
  });

  test('صافي الثروة: الأصول − الالتزامات', async () => {
    await makeAccount(owner.api, { name: 'كارت', type: 'card', opening_balance_minor: -300_000 });
    await makeAccount(owner.api, { name: 'خارج الحساب', opening_balance_minor: 999_999, include_in_net_worth: false });
    const worth = expectStatus(await owner.api.get('/reports/net-worth'), 200);
    const cashBalance = 1_000_000 - 640_000 + 2_000_000 - 500_000;
    assert.equal(worth.assets_minor, cashBalance + 500_000);
    assert.equal(worth.liabilities_minor, 300_000);
    assert.equal(worth.net_minor, cashBalance + 500_000 - 300_000);
  });

  test('الشهر المالي من يوم القبض يغيّر حدود الفترة', async () => {
    expectStatus(await owner.api.patch('/household', { month_start_day: 25 }), 200);
    const summary = expectStatus(await owner.api.get('/reports/summary', { month: '2026-01' }), 200);
    assert.equal(summary.period.from, '2026-01-25');
    assert.equal(summary.period.to, '2026-02-24');
    expectStatus(await owner.api.patch('/household', { month_start_day: 1 }), 200);
  });
});

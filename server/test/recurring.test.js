import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { queryOne } from '../src/config/db.js';
import { addDays } from '../src/utils/dates.js';
import { recurringService } from '../src/modules/recurring/recurring.service.js';
import {
  TODAY, addMember, balanceOf, categoryNamed, day, expectStatus, makeAccount, makeApp, registerHousehold,
  resetDatabase, shutdown,
} from './helpers.js';

const { http } = makeApp();
let owner;
let internet;
let rent;
let salary;
let cash;

/** قاعدة جاهزة (شهرية افتراضيًّا) */
const makeRule = async (api, overrides = {}) => expectStatus(await api.post('/recurring', {
  name: 'اشتراك النت', type: 'expense', account_id: cash.id, category_id: internet.id, amount_minor: 45_000,
  frequency: 'monthly', start_on: TODAY, ...overrides,
}), 201);

const dueOf = async (api, query = {}) => expectStatus(await api.get('/bills/due', query), 200);
const countTx = async (accountId) => (await queryOne(
  'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?', [accountId, accountId],
)).n;

before(async () => {
  await resetDatabase();
  owner = await registerHousehold(http);
  internet = await categoryNamed(owner.api, 'إنترنت البيت');
  rent = await categoryNamed(owner.api, 'إيجار');
  salary = await categoryNamed(owner.api, 'مرتب');
  cash = await makeAccount(owner.api, { name: 'كاش البيت', opening_balance_minor: 1_000_000 });
});
after(shutdown);

describe('إنشاء القاعدة والتحقّق منها', () => {
  test('المعاد القادم والمتبقّي محسوبان', async () => {
    const rule = await makeRule(owner.api, { total_count: 12 });
    assert.equal(rule.next_due_on, TODAY);
    assert.equal(rule.remaining_count, 12);
    assert.equal(rule.auto_post, false);
    assert.equal(rule.can_edit, true);
    assert.equal(rule.category_name, 'إنترنت البيت');
  });

  test('نفس قواعد شكل العملية: التصنيف، التحويل، النهاية قبل البداية', async () => {
    const wrongKind = await owner.api.post('/recurring', {
      name: 'غلط', type: 'expense', account_id: cash.id, category_id: salary.id, amount_minor: 100, frequency: 'monthly', start_on: TODAY,
    });
    assert.equal(wrongKind.body.errors.category_id, 'التصنيف ده للدخل مش للمصروف');

    const selfTransfer = await owner.api.post('/recurring', {
      name: 'غلط', type: 'transfer', account_id: cash.id, to_account_id: cash.id, amount_minor: 100, frequency: 'monthly', start_on: TODAY,
    });
    assert.equal(selfTransfer.body.errors.to_account_id, 'مينفعش تحوّل لنفس الحساب');

    const badEnd = await owner.api.post('/recurring', {
      name: 'غلط', type: 'expense', account_id: cash.id, category_id: rent.id, amount_minor: 100, frequency: 'monthly', start_on: TODAY, end_on: day(-1),
    });
    assert.equal(badEnd.body.errors.end_on, 'تاريخ النهاية قبل أول معاد');

    const rule = await makeRule(owner.api);
    const badPatch = await owner.api.patch(`/recurring/${rule.id}`, { end_on: day(-5) });
    assert.equal(badPatch.body.errors.end_on, 'تاريخ النهاية قبل أول معاد');
  });

  test('الإيجار يوم 31 يقع 29 فبراير في السنة الكبيسة (عبر قائمة المستحقّ)', async () => {
    const rule = await makeRule(owner.api, { name: 'إيجار 2028', category_id: rent.id, start_on: '2028-01-31' });
    const { items } = await dueOf(owner.api, { from: '2028-01-01', to: '2028-04-30' });
    const mine = items.filter((item) => item.source_id === rule.id).map((item) => item.due_on);
    assert.deepEqual(mine, ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
    expectStatus(await owner.api.del(`/recurring/${rule.id}`), 204);
  });
});

describe('«دفعت»: التسجيل والـ idempotency', () => {
  let rule;
  before(async () => {
    // أسبوعية بدأت من 61 يوم: 9 مواعيد فاتت، والباقي جاي خلال الشهر
    rule = await makeRule(owner.api, { name: 'إيجار الشقة', category_id: rent.id, amount_minor: 500_000, start_on: addDays(TODAY, -61), frequency: 'weekly', interval_count: 1 });
  });

  test('المتأخر يظهر overdue والقادم upcoming', async () => {
    const { items, today } = await dueOf(owner.api);
    assert.equal(today, TODAY);
    const mine = items.filter((item) => item.source_id === rule.id);
    assert.ok(mine.length >= 9);
    assert.equal(mine[0].due_on, rule.start_on);
    assert.equal(mine[0].status, 'overdue');
    assert.ok(mine.some((item) => item.status === 'upcoming'));
    assert.equal(mine[0].can_post, true);
  });

  test('التسجيل ينشئ عملية حقيقية بمبلغ القاعدة واسمها، والضغطة المكرّرة لا تكرّرها', async () => {
    const balance = await balanceOf(owner.api, cash.id);
    const first = await owner.api.post(`/recurring/${rule.id}/post`, { due_on: rule.start_on });
    const posted = expectStatus(first, 201);
    assert.equal(posted.already_posted, false);
    assert.equal(posted.transaction.amount_minor, 500_000);
    assert.equal(posted.transaction.payee, 'إيجار الشقة');
    assert.equal(posted.transaction.occurred_on, TODAY);
    assert.equal(await balanceOf(owner.api, cash.id), balance - 500_000);

    const again = expectStatus(await owner.api.post(`/recurring/${rule.id}/post`, { due_on: rule.start_on }), 200);
    assert.equal(again.already_posted, true);
    assert.equal(again.transaction.id, posted.transaction.id);
    assert.equal(await balanceOf(owner.api, cash.id), balance - 500_000);

    const { items } = await dueOf(owner.api);
    assert.ok(!items.some((item) => item.source_id === rule.id && item.due_on === rule.start_on));
  });

  test('ضغطات متزامنة على نفس المعاد = عملية واحدة', async () => {
    const dueOn = addDays(rule.start_on, 7);
    const before = await countTx(cash.id);
    const responses = await Promise.all([1, 2, 3, 4].map(() => owner.api.post(`/recurring/${rule.id}/post`, { due_on: dueOn })));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200, 200, 201]);
    assert.equal(new Set(responses.map((response) => response.body.data.transaction.id)).size, 1);
    assert.equal(await countTx(cash.id), before + 1);
  });

  test('مبلغ وتاريخ مختلفين للمرة دي، والتاريخ لازم يكون من مواعيدها', async () => {
    const dueOn = addDays(rule.start_on, 14);
    const notOccurrence = await owner.api.post(`/recurring/${rule.id}/post`, { due_on: addDays(dueOn, 1) });
    assert.equal(notOccurrence.status, 422);
    assert.equal(notOccurrence.body.errors.due_on, 'التاريخ ده مش من مواعيد الفاتورة');

    const posted = expectStatus(await owner.api.post(`/recurring/${rule.id}/post`, { due_on: dueOn, amount_minor: 520_000, occurred_on: dueOn }), 201);
    assert.equal(posted.transaction.amount_minor, 520_000);
    assert.equal(posted.transaction.occurred_on, dueOn);
  });

  test('التخطّي يشيل المعاد، ولا تسجيل بعد التخطّي ولا تخطّي بعد التسجيل', async () => {
    const dueOn = addDays(rule.start_on, 21);
    expectStatus(await owner.api.post(`/recurring/${rule.id}/skip`, { due_on: dueOn }), 200);
    const again = expectStatus(await owner.api.post(`/recurring/${rule.id}/skip`, { due_on: dueOn }), 200);
    assert.equal(again.already_skipped, true);
    assert.equal((await owner.api.post(`/recurring/${rule.id}/post`, { due_on: dueOn })).body.code, 'ALREADY_SKIPPED');
    assert.equal((await owner.api.post(`/recurring/${rule.id}/skip`, { due_on: rule.start_on })).body.code, 'ALREADY_POSTED');

    const { items } = await dueOf(owner.api);
    assert.ok(!items.some((item) => item.source_id === rule.id && item.due_on === dueOn));
    const fresh = expectStatus(await owner.api.get(`/recurring/${rule.id}`), 200);
    assert.equal(fresh.next_due_on, addDays(rule.start_on, 28));
    assert.equal(fresh.history.length, 4);
  });

  test('حذف العملية المولّدة يرجّع المعاد مستحقًّا', async () => {
    const dueOn = addDays(rule.start_on, 28);
    const { transaction } = expectStatus(await owner.api.post(`/recurring/${rule.id}/post`, { due_on: dueOn }), 201);
    expectStatus(await owner.api.del(`/transactions/${transaction.id}`), 204);
    const fresh = expectStatus(await owner.api.get(`/recurring/${rule.id}`), 200);
    assert.equal(fresh.next_due_on, dueOn);
    const reposted = expectStatus(await owner.api.post(`/recurring/${rule.id}/post`, { due_on: dueOn }), 201);
    assert.notEqual(reposted.transaction.id, transaction.id);
  });

  test('حذف القاعدة لا يمسّ العمليات اللي اتسجّلت منها', async () => {
    const throwaway = await makeRule(owner.api, { name: 'مؤقتة' });
    const { transaction } = expectStatus(await owner.api.post(`/recurring/${throwaway.id}/post`, { due_on: TODAY }), 201);
    expectStatus(await owner.api.del(`/recurring/${throwaway.id}`), 204);
    assert.equal((await owner.api.get(`/recurring/${throwaway.id}`)).status, 404);
    expectStatus(await owner.api.get(`/transactions/${transaction.id}`), 200);
  });

  test('تحويل ودخل متكرّران', async () => {
    const bank = await makeAccount(owner.api, { name: 'البنك', type: 'bank' });
    const transfer = await makeRule(owner.api, { name: 'تحويل للبيت', type: 'transfer', category_id: undefined, account_id: bank.id, to_account_id: cash.id, amount_minor: 100_000 });
    assert.equal(transfer.category_id, null);
    const posted = expectStatus(await owner.api.post(`/recurring/${transfer.id}/post`, { due_on: TODAY }), 201);
    assert.equal(posted.transaction.type, 'transfer');
    assert.equal(posted.transaction.to_account_id, cash.id);

    const income = await makeRule(owner.api, { name: 'المرتب', type: 'income', account_id: bank.id, category_id: salary.id, amount_minor: 2_000_000 });
    expectStatus(await owner.api.post(`/recurring/${income.id}/post`, { due_on: TODAY }), 201);
    assert.equal(await balanceOf(owner.api, bank.id), 2_000_000 - 100_000);
  });
});

describe('الحسابات الخاصّة والأدوار', () => {
  let member;
  let child;
  let viewer;
  let pocket;
  let childRule;
  let sharedRule;

  before(async () => {
    member = await addMember(http, owner.token, 'member', 'الأم');
    child = await addMember(http, owner.token, 'child', 'الابن');
    viewer = await addMember(http, owner.token, 'viewer', 'الجد');
    pocket = await makeAccount(child.api, { name: 'مصروفي', scope: 'private', opening_balance_minor: 20_000 });
    const games = await categoryNamed(child.api, 'ترفيه وخروجات');
    childRule = expectStatus(await child.api.post('/recurring', {
      name: 'اشتراك ألعاب', type: 'expense', account_id: pocket.id, category_id: games.id, amount_minor: 5_000, frequency: 'monthly', start_on: TODAY,
    }), 201);
    sharedRule = await makeRule(owner.api, { name: 'الكهرباء', category_id: (await categoryNamed(owner.api, 'كهرباء')).id });
  });

  test('قاعدة الجيب الخاص لا يعرف بها غير صاحبها — ولا صاحب الأسرة', async () => {
    const ownerRules = expectStatus(await owner.api.get('/recurring'), 200);
    assert.ok(!ownerRules.some((rule) => rule.id === childRule.id));
    assert.equal((await owner.api.get(`/recurring/${childRule.id}`)).status, 404);
    assert.equal((await owner.api.post(`/recurring/${childRule.id}/post`, { due_on: TODAY })).status, 404);
    const ownerDue = await dueOf(owner.api);
    assert.ok(!ownerDue.items.some((item) => item.source_id === childRule.id));

    const childDue = await dueOf(child.api);
    assert.deepEqual([...new Set(childDue.items.map((item) => item.source_id))], [childRule.id]);
    assert.deepEqual(expectStatus(await child.api.get('/recurring'), 200).map((rule) => rule.id), [childRule.id]);
  });

  test('الابن لا يعمل قاعدة على حساب مشترك', async () => {
    const response = await child.api.post('/recurring', {
      name: 'غلط', type: 'expense', account_id: cash.id, category_id: internet.id, amount_minor: 100, frequency: 'monthly', start_on: TODAY,
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.errors.account_id, 'الحساب غير موجود');
  });

  test('الفرد يسجّل فاتورة مشتركة، والمشاهد يشوفها من غير ما يسجّل', async () => {
    expectStatus(await member.api.post(`/recurring/${sharedRule.id}/post`, { due_on: TODAY }), 201);

    const seen = expectStatus(await viewer.api.get(`/recurring/${sharedRule.id}`), 200);
    assert.equal(seen.can_edit, false);
    const viewerDue = await dueOf(viewer.api);
    assert.ok(viewerDue.items.length > 0);
    assert.ok(viewerDue.items.every((item) => item.can_post === false));
    assert.equal((await viewer.api.post(`/recurring/${sharedRule.id}/post`, { due_on: TODAY })).status, 403);
  });

  test('تحويل من حساب مشترك لجيب الفرد الخاص مخفي عن الأسرة', async () => {
    const purse = await makeAccount(member.api, { name: 'شنطتي', scope: 'private' });
    const allowance = expectStatus(await member.api.post('/recurring', {
      name: 'مصروف الأم', type: 'transfer', account_id: cash.id, to_account_id: purse.id, amount_minor: 30_000, frequency: 'monthly', start_on: TODAY,
    }), 201);
    assert.equal((await owner.api.get(`/recurring/${allowance.id}`)).status, 404);
    expectStatus(await member.api.get(`/recurring/${allowance.id}`), 200);
  });
});

describe('التسجيل التلقائي', () => {
  let auto;
  let remind;
  let household;

  before(async () => {
    const other = await registerHousehold(http);
    household = other.user.household.id;
    const wallet = await makeAccount(other.api, { name: 'المحفظة', type: 'wallet' });
    const netCategory = await categoryNamed(other.api, 'إنترنت البيت');
    const base = { type: 'expense', account_id: wallet.id, category_id: netCategory.id, amount_minor: 10_000, frequency: 'weekly' };
    auto = expectStatus(await other.api.post('/recurring', { ...base, name: 'تلقائي', start_on: addDays(TODAY, -14), auto_post: true }), 201);
    remind = expectStatus(await other.api.post('/recurring', { ...base, name: 'تذكير', start_on: addDays(TODAY, -14) }), 201);
    owner.other = other;
    owner.wallet = wallet;
  });

  test('يسجّل كل المواعيد التلقائية لحدّ النهارده بتواريخها، والتذكير يفضل مستحقًّا', async () => {
    const result = await recurringService.postDueAuto({ householdId: household });
    assert.deepEqual(result, { posted: 3, failed: 0 });

    const { data } = (await owner.other.api.get('/transactions', { account_id: owner.wallet.id })).body;
    assert.deepEqual(data.map((row) => row.occurred_on).sort(), [addDays(TODAY, -14), addDays(TODAY, -7), TODAY]);
    assert.ok(data.every((row) => row.payee === 'تلقائي'));

    const { items } = await dueOf(owner.other.api, { to: TODAY });
    assert.deepEqual(items.map((item) => item.source_id), [remind.id, remind.id, remind.id]);
    const audit = await queryOne("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'recurring.post' AND entity_id = ?", [auto.id]);
    assert.equal(audit.n, 3);
  });

  test('idempotent: التشغيل التاني لا يكرّر — ويكمل من حيث وقف لما الوقت يعدّي', async () => {
    assert.deepEqual(await recurringService.postDueAuto({ householdId: household }), { posted: 0, failed: 0 });
    const nextWeek = new Date(Date.now() + 7 * 86_400_000);
    assert.deepEqual(await recurringService.postDueAuto({ householdId: household, now: nextWeek }), { posted: 1, failed: 0 });
    assert.equal(await countTx(owner.wallet.id), 4);
  });

  test('لو الحساب اتأرشف: يفشل بهدوء ويفضل تذكيرًا عليه تنبيه', async () => {
    expectStatus(await owner.other.api.patch(`/accounts/${owner.wallet.id}`, { archived: true }), 200);
    const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000);
    assert.deepEqual(await recurringService.postDueAuto({ householdId: household, now: inTwoWeeks }), { posted: 0, failed: 1 });
    const fresh = expectStatus(await owner.other.api.get(`/recurring/${auto.id}`), 200);
    assert.equal(fresh.problem, 'account_archived');
    const manual = await owner.other.api.post(`/recurring/${auto.id}/post`, { due_on: fresh.next_due_on });
    assert.equal(manual.body.code, 'ACCOUNT_ARCHIVED');
  });
});

describe('حذف حساب أو تصنيف عليه فاتورة', () => {
  test('يتأرشف بدل ما يتحذف، والفاتورة تفضل بتنبيه', async () => {
    const card = await makeAccount(owner.api, { name: 'كارت جديد', type: 'card' });
    const rule = await makeRule(owner.api, { name: 'نتفليكس', account_id: card.id });
    const removed = expectStatus(await owner.api.del(`/accounts/${card.id}`), 200);
    assert.equal(removed.archived, true);
    assert.equal(expectStatus(await owner.api.get(`/recurring/${rule.id}`), 200).problem, 'account_archived');

    const category = expectStatus(await owner.api.post('/categories', { kind: 'expense', name: 'اشتراكات' }), 201);
    const subscription = await makeRule(owner.api, { name: 'سبوتيفاي', category_id: category.id });
    expectStatus(await owner.api.del(`/categories/${category.id}`), 200);
    const fresh = expectStatus(await owner.api.get(`/recurring/${subscription.id}`), 200);
    assert.equal(fresh.problem, 'category_archived');
    const due = await dueOf(owner.api);
    assert.equal(due.items.find((item) => item.source_id === subscription.id).can_post, false);
  });
});

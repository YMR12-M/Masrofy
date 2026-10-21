import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../src/utils/dates.js';
import {
  TODAY, addMember, balanceOf, categoryNamed, expectStatus, makeAccount, makeApp, registerHousehold,
  resetDatabase, shutdown,
} from './helpers.js';

const { http } = makeApp();
let owner;
let debts;
let cash;

const makePlan = async (api, overrides = {}) => expectStatus(await api.post('/installments', {
  name: 'تلاجة', account_id: cash.id, category_id: debts.id, payee: 'بي تك',
  total_minor: 3_000_000, down_payment_minor: 600_000, installment_count: 6,
  purchase_on: TODAY, first_due_on: addDays(TODAY, 30), ...overrides,
}), 201);

const planOf = async (api, id) => expectStatus(await api.get(`/installments/${id}`), 200);
const pay = (api, plan, item, body = {}) => api.post(`/installments/${plan.id}/items/${item.id}/pay`, body);

before(async () => {
  await resetDatabase();
  owner = await registerHousehold(http);
  debts = await categoryNamed(owner.api, 'أقساط وديون');
  cash = await makeAccount(owner.api, { name: 'كاش', opening_balance_minor: 5_000_000 });
});
after(shutdown);

describe('الجدول والرصيد', () => {
  let plan;
  before(async () => { plan = await makePlan(owner.api); });

  test('المقدّم صف 0 يوم الشراء، والأقساط شهرية والمجموع = الإجمالي', () => {
    assert.equal(plan.items.length, 7);
    assert.deepEqual(plan.items[0], { ...plan.items[0], seq: 0, due_on: TODAY, amount_minor: 600_000 });
    assert.ok(plan.items.slice(1).every((item) => item.amount_minor === 400_000));
    assert.equal(plan.total_minor, 3_000_000);
    assert.equal(plan.paid_minor, 0);
    assert.equal(plan.remaining_minor, 3_000_000);
    assert.equal(plan.next_item.seq, 0);
    assert.equal(plan.done, false);
  });

  test('سداد المقدّم مصروف حقيقي على الحساب، والرصيد المتبقّي يقلّ', async () => {
    const balance = await balanceOf(owner.api, cash.id);
    const paid = expectStatus(await pay(owner.api, plan, plan.items[0]), 201);
    assert.equal(paid.transaction.amount_minor, 600_000);
    assert.equal(paid.transaction.payee, 'بي تك');
    assert.equal(paid.transaction.note, 'المقدّم — تلاجة');
    assert.equal(paid.transaction.category_id, debts.id);
    assert.equal(await balanceOf(owner.api, cash.id), balance - 600_000);

    const fresh = await planOf(owner.api, plan.id);
    assert.equal(fresh.paid_minor, 600_000);
    assert.equal(fresh.remaining_minor, 2_400_000);
    assert.equal(fresh.paid_bps, 2000);
    assert.equal(fresh.items[0].status, 'paid');
    assert.equal(fresh.items[0].transaction_id, paid.transaction.id);
    assert.equal(fresh.next_item.seq, 1);
  });

  test('الضغطة المكرّرة (ولو متزامنة) لا تسجّل القسط مرتين', async () => {
    const item = plan.items[1];
    const responses = await Promise.all([1, 2, 3].map(() => pay(owner.api, plan, item, { occurred_on: TODAY })));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200, 201]);
    assert.equal(new Set(responses.map((response) => response.body.data.transaction.id)).size, 1);
    assert.equal(responses.find((response) => response.status === 201).body.data.transaction.note, 'قسط 1 من 6 — تلاجة');
    const fresh = await planOf(owner.api, plan.id);
    assert.equal(fresh.remaining_minor, 2_000_000);
    assert.equal(fresh.installments_paid, 1);
  });

  test('«اتدفع قبل كده» بلا عملية يقلّل المتبقّي بدون ما يمسّ الرصيد، ويتلغى', async () => {
    const balance = await balanceOf(owner.api, cash.id);
    const item = plan.items[2];
    const settled = expectStatus(await owner.api.patch(`/installments/${plan.id}/items/${item.id}`, { settled: true }), 200);
    assert.equal(settled.items[2].status, 'settled');
    assert.equal(settled.remaining_minor, 1_600_000);
    assert.equal(await balanceOf(owner.api, cash.id), balance);
    assert.equal((await pay(owner.api, plan, item)).body.code, 'ALREADY_SETTLED');

    const undone = expectStatus(await owner.api.patch(`/installments/${plan.id}/items/${item.id}`, { settled: false }), 200);
    assert.equal(undone.remaining_minor, 2_000_000);
    // المدفوع بعملية لا يتعلّم ولا يتلغى بالعلامة
    assert.equal((await owner.api.patch(`/installments/${plan.id}/items/${plan.items[1].id}`, { settled: false })).body.code, 'ALREADY_PAID');
  });

  test('حذف عملية القسط يرجّعه مستحقًّا', async () => {
    const before = await planOf(owner.api, plan.id);
    expectStatus(await owner.api.del(`/transactions/${before.items[1].transaction_id}`), 204);
    const after = await planOf(owner.api, plan.id);
    assert.equal(after.items[1].paid, false);
    assert.equal(after.remaining_minor, before.remaining_minor + 400_000);
  });

  test('الخطّة تخلص لما كل الصفوف تتدفع', async () => {
    // أول قسط فات من 5 أيام (متأخر)، والتاني بعد شهر منه (جاي)
    const small = await makePlan(owner.api, { name: 'سماعة', total_minor: 90_000, down_payment_minor: 0, installment_count: 2, purchase_on: addDays(TODAY, -40), first_due_on: addDays(TODAY, -5) });
    assert.equal(small.items.length, 2);
    assert.equal(small.overdue_count, 1);
    for (const item of small.items) expectStatus(await pay(owner.api, small, item), 201);
    const done = await planOf(owner.api, small.id);
    assert.equal(done.done, true);
    assert.equal(done.remaining_minor, 0);
    assert.equal(done.next_item, null);
  });
});

describe('التحقّق والتعديل', () => {
  test('المقدّم أقل من الإجمالي، والأقساط لا تزيد عن الباقي بالقرش، وأول قسط بعد الشراء', async () => {
    const base = { name: 'غلط', account_id: cash.id, category_id: debts.id, first_due_on: TODAY };
    const bigDown = await owner.api.post('/installments', { ...base, total_minor: 1_000, down_payment_minor: 1_000, installment_count: 2 });
    assert.equal(bigDown.body.errors.down_payment_minor, 'المقدّم لازم أقل من الإجمالي');
    const tooMany = await owner.api.post('/installments', { ...base, total_minor: 5, installment_count: 6 });
    assert.equal(tooMany.body.errors.installment_count, 'الأقساط أكتر من المبلغ الباقي');
    const early = await owner.api.post('/installments', { ...base, total_minor: 1_000, installment_count: 2, purchase_on: addDays(TODAY, 1) });
    assert.equal(early.body.errors.first_due_on, 'أول قسط قبل يوم الشراء');
    const income = await categoryNamed(owner.api, 'مرتب');
    const wrongKind = await owner.api.post('/installments', { ...base, total_minor: 1_000, installment_count: 2, category_id: income.id });
    assert.equal(wrongKind.body.errors.category_id, 'التصنيف ده للدخل مش للمصروف');
  });

  test('تغيير المبلغ أو العدد يعيد التوليد طالما مفيش حاجة اتدفعت، وبعدها ممنوع', async () => {
    const plan = await makePlan(owner.api, { name: 'غسالة', down_payment_minor: 0, total_minor: 1_200_000, installment_count: 12 });
    const rescheduled = expectStatus(await owner.api.patch(`/installments/${plan.id}`, { installment_count: 10, total_minor: 1_000_003 }), 200);
    assert.equal(rescheduled.items.length, 10);
    assert.equal(rescheduled.items[9].amount_minor, 100_003);
    assert.equal(rescheduled.total_minor, 1_000_003);

    expectStatus(await pay(owner.api, rescheduled, rescheduled.items[0]), 201);
    const blocked = await owner.api.patch(`/installments/${plan.id}`, { installment_count: 5 });
    assert.equal(blocked.body.code, 'PLAN_HAS_PAYMENTS');
    // الاسم والجهة يتعدّلوا عادي
    const renamed = expectStatus(await owner.api.patch(`/installments/${plan.id}`, { name: 'غسالة توشيبا' }), 200);
    assert.equal(renamed.name, 'غسالة توشيبا');
    assert.equal(renamed.items.length, 10);
  });

  test('حذف الخطّة يسيب العمليات اللي اتسجّلت', async () => {
    const plan = await makePlan(owner.api, { name: 'بوتاجاز', down_payment_minor: 0, total_minor: 200_000, installment_count: 2 });
    const { transaction } = expectStatus(await pay(owner.api, plan, plan.items[0]), 201);
    expectStatus(await owner.api.del(`/installments/${plan.id}`), 204);
    assert.equal((await owner.api.get(`/installments/${plan.id}`)).status, 404);
    expectStatus(await owner.api.get(`/transactions/${transaction.id}`), 200);
  });
});

describe('قائمة المستحقّ والخصوصية', () => {
  let member;
  let child;
  let pocketPlan;
  let sharedPlan;

  before(async () => {
    member = await addMember(http, owner.token, 'member', 'الأم');
    child = await addMember(http, owner.token, 'child', 'الابن');
    const pocket = await makeAccount(child.api, { name: 'جيبي', scope: 'private', opening_balance_minor: 100_000 });
    pocketPlan = expectStatus(await child.api.post('/installments', {
      name: 'موبايل', account_id: pocket.id, category_id: debts.id, total_minor: 60_000, installment_count: 3, first_due_on: TODAY,
    }), 201);
    sharedPlan = await makePlan(owner.api, {
      name: 'تكييف', down_payment_minor: 0, total_minor: 900_000, installment_count: 3, purchase_on: addDays(TODAY, -10), first_due_on: addDays(TODAY, -1),
    });
  });

  test('الأقساط في قائمة المستحقّ برقمها، والمتأخر overdue', async () => {
    const { items } = expectStatus(await owner.api.get('/bills/due'), 200);
    const mine = items.filter((item) => item.source === 'installment' && item.source_id === sharedPlan.id);
    assert.equal(mine[0].status, 'overdue');
    assert.deepEqual(mine[0].installment, { seq: 1, count: 3 });
    assert.equal(mine[0].item_id, sharedPlan.items[0].id);
    assert.equal(mine[0].can_post, true);
    // المرتّب بالتاريخ
    assert.deepEqual(items.map((item) => item.due_on), [...items.map((item) => item.due_on)].sort());
  });

  test('خطّة الجيب الخاص لا تظهر للأسرة، والفرد يسدّد الخطّة المشتركة', async () => {
    assert.equal((await owner.api.get(`/installments/${pocketPlan.id}`)).status, 404);
    assert.ok(!expectStatus(await owner.api.get('/installments'), 200).some((plan) => plan.id === pocketPlan.id));
    const ownerDue = expectStatus(await owner.api.get('/bills/due'), 200);
    assert.ok(!ownerDue.items.some((item) => item.source_id === pocketPlan.id && item.source === 'installment'));
    assert.equal((await pay(owner.api, pocketPlan, pocketPlan.items[0])).status, 404);

    const childDue = expectStatus(await child.api.get('/bills/due'), 200);
    assert.ok(childDue.items.every((item) => item.source_id === pocketPlan.id));
    assert.equal(childDue.sources.installments, 1);

    expectStatus(await pay(member.api, sharedPlan, sharedPlan.items[0]), 201);
  });

  test('قسط سدّده فرد من جيبه الخاص: الأسرة تعرف إنه اتدفع، لا من أين', async () => {
    const purse = await makeAccount(member.api, { name: 'شنطتي', scope: 'private', opening_balance_minor: 500_000 });
    const paid = expectStatus(await pay(member.api, sharedPlan, sharedPlan.items[1], { account_id: purse.id }), 201);
    assert.equal(paid.transaction.account_id, purse.id);

    const seenByOwner = await planOf(owner.api, sharedPlan.id);
    assert.equal(seenByOwner.items[1].paid, true);
    assert.equal(seenByOwner.items[1].transaction_id, null);
    assert.equal(seenByOwner.items[1].paid_on, null);
    // الضغطة المكرّرة من صاحب الأسرة: «اتدفع» من غير ما تكشف العملية
    const again = expectStatus(await pay(owner.api, sharedPlan, sharedPlan.items[1]), 200);
    assert.equal(again.already_paid, true);
    assert.equal(again.transaction, null);
  });
});

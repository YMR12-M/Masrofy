import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMember, balanceOf, categoryNamed, day, expectStatus, makeAccount, makeApp, mustRecord, record,
  registerHousehold, resetDatabase, shutdown,
} from './helpers.js';

const { http } = makeApp();
let owner;
let food;
let salary;
let supermarket;

before(async () => {
  await resetDatabase();
  owner = await registerHousehold(http);
  food = await categoryNamed(owner.api, 'أكل وشرب');
  supermarket = await categoryNamed(owner.api, 'سوبرماركت');
  salary = await categoryNamed(owner.api, 'مرتب');
});
after(shutdown);

describe('الأرصدة', () => {
  test('الرصيد = الافتتاحي + الدخل − المصروف ± التحويلات', async () => {
    const cash = await makeAccount(owner.api, { name: 'كاش البيت', opening_balance_minor: 100_000 });
    const bank = await makeAccount(owner.api, { name: 'البنك', type: 'bank' });
    assert.equal(cash.balance_minor, 100_000);

    await mustRecord(owner.api, { type: 'income', account_id: bank.id, category_id: salary.id, amount_minor: 1_500_000 });
    await mustRecord(owner.api, { type: 'expense', account_id: cash.id, category_id: supermarket.id, amount_minor: 35_050 });
    await mustRecord(owner.api, { type: 'transfer', account_id: bank.id, to_account_id: cash.id, amount_minor: 200_000 });

    assert.equal(await balanceOf(owner.api, cash.id), 100_000 - 35_050 + 200_000);
    assert.equal(await balanceOf(owner.api, bank.id), 1_500_000 - 200_000);
  });

  test('بطاقة ائتمان برصيد افتتاحي سالب (مديونية سابقة)', async () => {
    const card = await makeAccount(owner.api, { name: 'فيزا', type: 'card', opening_balance_minor: -250_000, credit_limit_minor: 2_000_000 });
    await mustRecord(owner.api, { type: 'expense', account_id: card.id, category_id: supermarket.id, amount_minor: 10_000 });
    assert.equal(await balanceOf(owner.api, card.id), -260_000);
  });
});

describe('قواعد شكل العملية', () => {
  let cash;
  before(async () => { cash = await makeAccount(owner.api); });

  test('المصروف يحتاج تصنيف مصروف', async () => {
    const missing = await record(owner.api, { type: 'expense', account_id: cash.id, amount_minor: 100 });
    assert.equal(missing.status, 422);
    assert.equal(missing.body.errors.category_id, 'اختار التصنيف');

    const wrongKind = await record(owner.api, { type: 'expense', account_id: cash.id, category_id: salary.id, amount_minor: 100 });
    assert.equal(wrongKind.body.errors.category_id, 'التصنيف ده للدخل مش للمصروف');
  });

  test('التحويل يحتاج وجهة مختلفة، وتصنيفه يُتجاهل', async () => {
    const same = await record(owner.api, { type: 'transfer', account_id: cash.id, to_account_id: cash.id, amount_minor: 100 });
    assert.equal(same.body.errors.to_account_id, 'مينفعش تحوّل لنفس الحساب');

    const other = await makeAccount(owner.api);
    const transfer = await mustRecord(owner.api, {
      type: 'transfer', account_id: cash.id, to_account_id: other.id, category_id: food.id, amount_minor: 100,
    });
    assert.equal(transfer.category_id, null);
  });

  test('المبلغ عدد صحيح موجب بالقروش، والتاريخ صالح', async () => {
    const zero = await record(owner.api, { type: 'expense', account_id: cash.id, category_id: food.id, amount_minor: 0 });
    assert.equal(zero.status, 422);
    const fraction = await record(owner.api, { type: 'expense', account_id: cash.id, category_id: food.id, amount_minor: 10.5 });
    assert.equal(fraction.body.errors.amount_minor, 'المبلغ بالقروش — عدد صحيح');
    const badDate = await record(owner.api, { type: 'expense', account_id: cash.id, category_id: food.id, amount_minor: 100, occurred_on: '2026-02-30' });
    assert.equal(badDate.status, 422);
  });

  test('لا تسجيل على حساب مؤرشف', async () => {
    const old = await makeAccount(owner.api);
    expectStatus(await owner.api.patch(`/accounts/${old.id}`, { archived: true }), 200);
    const response = await record(owner.api, { type: 'expense', account_id: old.id, category_id: food.id, amount_minor: 100 });
    assert.equal(response.body.code, 'ACCOUNT_ARCHIVED');
  });

  test('التعديل يدمج ويعيد التحقّق: تحويل ← مصروف يلزمه تصنيف', async () => {
    const other = await makeAccount(owner.api);
    const transfer = await mustRecord(owner.api, { type: 'transfer', account_id: cash.id, to_account_id: other.id, amount_minor: 500 });
    const invalid = await owner.api.patch(`/transactions/${transfer.id}`, { type: 'expense' });
    assert.equal(invalid.body.errors.category_id, 'اختار التصنيف');

    const updated = expectStatus(await owner.api.patch(`/transactions/${transfer.id}`, { type: 'expense', category_id: food.id }), 200);
    assert.equal(updated.to_account_id, null);
    assert.equal(updated.category_id, food.id);
  });
});

describe('الحسابات الخاصّة والأدوار', () => {
  let member;
  let child;
  let shared;
  let pocket;

  before(async () => {
    member = await addMember(http, owner.token, 'member', 'الأم');
    child = await addMember(http, owner.token, 'child', 'الابن');
    shared = await makeAccount(owner.api, { name: 'مصروف البيت' });
    pocket = await makeAccount(child.api, { name: 'مصروفي', scope: 'private', opening_balance_minor: 5_000 });
  });

  test('الحساب الخاص لا يظهر لغير صاحبه — ولا لصاحب الأسرة', async () => {
    const ownerAccounts = expectStatus(await owner.api.get('/accounts'), 200);
    assert.ok(!ownerAccounts.some((account) => account.id === pocket.id));
    assert.equal((await owner.api.get(`/accounts/${pocket.id}`)).status, 404);

    const childAccounts = expectStatus(await child.api.get('/accounts'), 200);
    assert.deepEqual(childAccounts.map((account) => account.id), [pocket.id]);
  });

  test('الابن لا يسجّل على الحساب المشترك ولا يضيف حسابًا مشتركًا', async () => {
    const response = await record(child.api, { type: 'expense', account_id: shared.id, category_id: food.id, amount_minor: 100 });
    assert.equal(response.status, 422);
    assert.equal(response.body.errors.account_id, 'الحساب غير موجود');

    const sharedCreate = await child.api.post('/accounts', { name: 'مشترك', type: 'cash', scope: 'shared' });
    assert.equal(sharedCreate.status, 403);
  });

  test('الفرد يسجّل على المشترك لكن لا يعدّل الحساب نفسه', async () => {
    await mustRecord(member.api, { type: 'expense', account_id: shared.id, category_id: food.id, amount_minor: 2_000 });
    const account = expectStatus(await member.api.get(`/accounts/${shared.id}`), 200);
    assert.equal(account.can_record, true);
    assert.equal(account.can_manage, false);
    assert.equal((await member.api.patch(`/accounts/${shared.id}`, { name: 'اسم جديد' })).status, 403);
  });

  test('تحويل من جيب خاص لحساب مشترك يظهر للأسرة باسم «حساب خاص»', async () => {
    const memberPocket = await makeAccount(member.api, { name: 'شنطتي', scope: 'private', opening_balance_minor: 50_000 });
    const transfer = await mustRecord(member.api, { type: 'transfer', account_id: memberPocket.id, to_account_id: shared.id, amount_minor: 10_000 });

    const seen = expectStatus(await owner.api.get(`/transactions/${transfer.id}`), 200);
    assert.equal(seen.account_name, 'حساب خاص');
    assert.equal(seen.to_account_name, 'مصروف البيت');
    // صاحب الأسرة لا يملك التسجيل على جيب غيره، فلا يقدر يعدّل التحويل
    assert.equal(seen.can_edit, false);
    assert.equal((await owner.api.del(`/transactions/${transfer.id}`)).status, 403);
  });

  test('القائمة لا تكشف عمليات جيب الابن للأسرة', async () => {
    await mustRecord(child.api, { type: 'expense', account_id: pocket.id, category_id: food.id, amount_minor: 1_500, payee: 'كانتين المدرسة' });
    const ownerList = (await owner.api.get('/transactions', { q: 'كانتين' })).body;
    assert.equal(ownerList.meta.total, 0);
    const childList = (await child.api.get('/transactions', { q: 'كانتين' })).body;
    assert.equal(childList.meta.total, 1);
    assert.equal(await balanceOf(child.api, pocket.id), 3_500);
  });
});

describe('القائمة والتصدير', () => {
  let wallet;
  before(async () => {
    wallet = await makeAccount(owner.api, { name: 'فودافون كاش', type: 'wallet' });
    await mustRecord(owner.api, { type: 'expense', account_id: wallet.id, category_id: supermarket.id, amount_minor: 12_000, occurred_on: day(-3), payee: 'كارفور' });
    await mustRecord(owner.api, { type: 'expense', account_id: wallet.id, category_id: food.id, amount_minor: 8_000, occurred_on: day(-1), note: '=1+1' });
    await mustRecord(owner.api, { type: 'income', account_id: wallet.id, category_id: salary.id, amount_minor: 50_000, occurred_on: day(-2) });
  });

  test('فلتر الحساب والتصنيف (الرئيسي يشمل فروعه) + المجاميع + الأحدث أولًا', async () => {
    const { data, meta } = (await owner.api.get('/transactions', { account_id: wallet.id, category_id: food.id })).body;
    assert.equal(meta.total, 2);
    assert.equal(meta.totals.expense_minor, 20_000);
    assert.equal(meta.totals.income_minor, 0);
    assert.ok(data[0].occurred_on >= data[1].occurred_on);
    assert.equal(data.find((row) => row.payee === 'كارفور').parent_category_name, 'أكل وشرب');
  });

  test('فلتر المدى والتقسيم لصفحات', async () => {
    const { data, meta } = (await owner.api.get('/transactions', { account_id: wallet.id, from: day(-2), to: day(-1), page_size: 1 })).body;
    assert.equal(meta.total, 2);
    assert.equal(meta.total_pages, 2);
    assert.equal(data.length, 1);
  });

  test('تصدير CSV بالعربي ومحمي من حقن الصيغ', async () => {
    const response = await owner.api.get('/transactions/export', { account_id: wallet.id });
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv/);
    assert.match(response.headers['content-disposition'], /attachment; filename="masrofy-transactions-/);
    assert.ok(response.text.startsWith('﻿'));
    assert.match(response.text, /كارفور/);
    assert.match(response.text, /,-120,/);
    assert.match(response.text, /'=1\+1/);
  });

  test('حذف عملية يرجّع الرصيد', async () => {
    const before = await balanceOf(owner.api, wallet.id);
    const tx = await mustRecord(owner.api, { type: 'expense', account_id: wallet.id, category_id: food.id, amount_minor: 999 });
    assert.equal(await balanceOf(owner.api, wallet.id), before - 999);
    assert.equal((await owner.api.del(`/transactions/${tx.id}`)).status, 204);
    assert.equal(await balanceOf(owner.api, wallet.id), before);
  });
});

describe('حذف الحسابات والتصنيفات', () => {
  test('حساب بلا عمليات يُحذف، وله عمليات يُؤرشف ويحرّر اسمه', async () => {
    const empty = await makeAccount(owner.api, { name: 'فاضي' });
    assert.equal((await owner.api.del(`/accounts/${empty.id}`)).status, 204);

    const used = await makeAccount(owner.api, { name: 'مستعمل' });
    await mustRecord(owner.api, { type: 'expense', account_id: used.id, category_id: food.id, amount_minor: 100 });
    expectStatus(await owner.api.del(`/accounts/${used.id}`), 200);
    const recreated = await makeAccount(owner.api, { name: 'مستعمل' });
    assert.notEqual(recreated.id, used.id);

    const duplicate = await owner.api.post('/accounts', { name: 'مستعمل', type: 'cash' });
    assert.equal(duplicate.body.code, 'NAME_TAKEN');
  });

  test('تصنيف مستخدم يُؤرشف مع فروعه ويختفي من القائمة', async () => {
    const parent = expectStatus(await owner.api.post('/categories', { kind: 'expense', name: 'سفر', icon: '✈️' }), 201);
    const child = expectStatus(await owner.api.post('/categories', { kind: 'expense', name: 'فنادق', parent_id: parent.id }), 201);
    const account = await makeAccount(owner.api);
    await mustRecord(owner.api, { type: 'expense', account_id: account.id, category_id: child.id, amount_minor: 100 });

    expectStatus(await owner.api.del(`/categories/${parent.id}`), 200);
    const active = expectStatus(await owner.api.get('/categories'), 200);
    assert.ok(!active.some((category) => [parent.id, child.id].includes(category.id)));

    const blocked = await record(owner.api, { type: 'expense', account_id: account.id, category_id: child.id, amount_minor: 100 });
    assert.equal(blocked.body.errors.category_id, 'التصنيف ده مؤرشف');
  });

  test('التصنيف الفرعي لا يكون أبًا، ولا نوع مختلف', async () => {
    const response = await owner.api.post('/categories', { kind: 'expense', name: 'فرع الفرع', parent_id: supermarket.id });
    assert.equal(response.body.errors.parent_id, 'لازم يكون تصنيف رئيسي');
    const crossKind = await owner.api.post('/categories', { kind: 'income', name: 'غلط', parent_id: food.id });
    assert.equal(crossKind.body.errors.parent_id, 'نوعه مختلف');
  });
});

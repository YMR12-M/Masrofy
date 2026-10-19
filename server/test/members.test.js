import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMember, expectStatus, login, makeAccount, makeApp, registerHousehold, resetDatabase, shutdown,
} from './helpers.js';

const { http } = makeApp();
let owner;

before(async () => {
  await resetDatabase();
  owner = await registerHousehold(http);
});
after(shutdown);

describe('إضافة فرد', () => {
  test('كلمة مؤقتة تُعرض مرّة واحدة، والفرد مُلزَم بتغييرها', async () => {
    const created = expectStatus(await owner.api.post('/members', { full_name: 'سارة', email: 'sara@test.local', role: 'member' }), 201);
    assert.ok(created.temp_password);
    assert.equal(created.member.must_change_password, true);

    const session = await login(http, 'sara@test.local', created.temp_password);
    assert.equal(session.status, 200);
    assert.equal(session.body.data.user.must_change_password, true);
    // أي مسار آخر مقفول لحد ما تتغيّر الكلمة
    const blocked = await http.get('/api/v1/accounts').set({ Authorization: `Bearer ${session.token}` });
    assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
  });

  test('غير المشرف لا يضيف أفرادًا، والكل يرى الأسماء بلا البريد', async () => {
    const member = await addMember(http, owner.token, 'member');
    const denied = await member.api.post('/members', { full_name: 'حد', email: 'x@test.local', role: 'child' });
    assert.equal(denied.status, 403);

    const list = expectStatus(await member.api.get('/members'), 200);
    assert.ok(list.length >= 2);
    assert.equal(list[0].role, 'owner');
    assert.equal(list[0].email, undefined);
  });

  test('المشرف لا يضيف صاحب أسرة', async () => {
    const admin = await addMember(http, owner.token, 'admin');
    const response = await admin.api.post('/members', { full_name: 'صاحب تاني', email: 'o2@test.local', role: 'owner' });
    assert.equal(response.body.code, 'OWNER_ONLY');
  });
});

describe('حماية الأسرة من نفسها', () => {
  test('لا تخفيض لآخر صاحب، ولا تغيير الدور بالنفس', async () => {
    const self = await owner.api.patch(`/members/${owner.user.id}`, { role: 'member' });
    assert.equal(self.body.code, 'SELF_CHANGE');

    const admin = await addMember(http, owner.token, 'admin');
    const demote = await admin.api.patch(`/members/${owner.user.id}`, { role: 'member' });
    assert.equal(demote.body.code, 'OWNER_ONLY');
  });

  test('إيقاف فرد يُنهي جلساته فورًا', async () => {
    const member = await addMember(http, owner.token, 'member');
    expectStatus(await owner.api.patch(`/members/${member.id}`, { status: 'suspended' }), 200);
    const response = await member.api.get('/accounts');
    assert.equal(response.body.code, 'USER_SUSPENDED');
  });

  test('حذف فرد يؤرشف حساباته الخاصّة ويحرّر بريده', async () => {
    const member = await addMember(http, owner.token, 'member');
    const pocket = await makeAccount(member.api, { scope: 'private', name: 'جيبي' });
    assert.equal(pocket.is_shared, false);

    assert.equal((await owner.api.del(`/members/${member.id}`)).status, 204);
    const again = await owner.api.post('/members', { full_name: 'نفس البريد', email: member.email, role: 'member' });
    assert.equal(again.status, 201);
  });

  test('كلمة مؤقتة جديدة لفرد نسي كلمته', async () => {
    const member = await addMember(http, owner.token, 'viewer');
    const { temp_password: temp } = expectStatus(await owner.api.post(`/members/${member.id}/temp-password`), 200);
    assert.equal((await login(http, member.email, temp)).body.data.user.must_change_password, true);
  });
});

describe('إعدادات الأسرة', () => {
  test('صاحب الأسرة يغيّر بداية الشهر المالي، والفرد لا', async () => {
    const updated = expectStatus(await owner.api.patch('/household', { month_start_day: 25, name: 'بيتنا' }), 200);
    assert.equal(updated.month_start_day, 25);
    assert.equal(updated.name, 'بيتنا');

    const member = await addMember(http, owner.token, 'member');
    assert.equal((await member.api.patch('/household', { month_start_day: 1 })).status, 403);
    assert.equal((await owner.api.patch('/household', { month_start_day: 31 })).status, 422);
  });
});

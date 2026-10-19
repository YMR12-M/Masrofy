import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execute, queryOne } from '../src/config/db.js';
import { outbox } from '../src/services/mailer.js';
import {
  API, PASSWORD, bearer, expectStatus, login, makeApp, registerHousehold, resetDatabase, shutdown,
} from './helpers.js';

const { http } = makeApp();

before(resetDatabase);
after(shutdown);

describe('التسجيل', () => {
  test('ينشئ الأسرة وصاحبها والتصنيفات المقترحة ويفتح جلسة مباشرة', async () => {
    const { user, api } = await registerHousehold(http, { email: 'reg@test.local', household_name: 'بيت الاختبار' });
    assert.equal(user.role, 'owner');
    assert.equal(user.household.name, 'بيت الاختبار');
    assert.equal(user.household.currency, 'EGP');
    assert.equal(user.household.month_start_day, 1);
    assert.ok(user.permissions.includes('household.manage'));
    assert.equal(user.password_hash, undefined);

    const categories = expectStatus(await api.get('/categories'), 200);
    assert.ok(categories.some((category) => category.kind === 'expense' && category.name === 'أكل وشرب'));
    assert.ok(categories.some((category) => category.kind === 'income' && category.name === 'مرتب'));
    // الفروع تأتي بعد أبيها مباشرة
    const food = categories.findIndex((category) => category.name === 'أكل وشرب');
    assert.equal(categories[food + 1].parent_id, categories[food].id);
  });

  test('البريد المكرّر مرفوض برسالة على الحقل', async () => {
    const response = await http.post(`${API}/auth/register`).send({
      household_name: 'أسرة', full_name: 'حد تاني', email: 'reg@test.local', password: PASSWORD,
    });
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'EMAIL_TAKEN');
    assert.equal(response.body.errors.email, 'مستخدم بالفعل');
  });

  test('كلمة مرور ضعيفة ورسائل التحقّق بالعربي', async () => {
    const response = await http.post(`${API}/auth/register`).send({
      household_name: 'أ', full_name: 'حد', email: 'weak@test.local', password: '12345678',
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.code, 'VALIDATION_ERROR');
    assert.match(response.body.errors.password, /كلمة المرور لازم/);
    assert.match(response.body.errors.household_name, /حروف على الأقل/);
  });

  test('خيارات شاشة الدخول متاحة بلا جلسة', async () => {
    const response = await http.get(`${API}/auth/options`);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.signup_enabled, true);
  });
});

describe('تسجيل الدخول', () => {
  before(() => registerHousehold(http, { email: 'a@test.local' }));

  test('نجاح: توكن دخول + كوكي httpOnly للويب، بلا توكن تجديد في الجسم', async () => {
    const { status, body, response } = await login(http, 'a@test.local');
    assert.equal(status, 200);
    assert.ok(body.data.tokens.access_token);
    assert.equal(body.data.tokens.refresh_token, undefined);
    const cookie = response.headers['set-cookie'][0];
    assert.match(cookie, /masrofy_rt=/);
    assert.match(cookie, /HttpOnly/i);
  });

  test('التطبيقات تستلم توكن التجديد في الجسم ولا تستلم كوكي', async () => {
    const { body, response } = await login(http, 'a@test.local', PASSWORD, 'mobile');
    assert.ok(body.data.tokens.refresh_token);
    assert.equal(response.headers['set-cookie'], undefined);
  });

  test('نفس الرسالة لبريد غير موجود وكلمة خاطئة', async () => {
    const unknown = await login(http, 'nobody@test.local', 'whatever-123');
    const wrong = await login(http, 'a@test.local', 'wrong-password-1');
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.body.message, wrong.body.message);
    assert.equal(unknown.body.code, 'BAD_CREDENTIALS');
  });

  test('بعد 5 محاولات فاشلة يُقفل حتى بالكلمة الصحيحة، وينفكّ بعد المدّة', async () => {
    await registerHousehold(http, { email: 'lock@test.local' });
    for (let i = 0; i < 5; i += 1) assert.equal((await login(http, 'lock@test.local', 'wrong-password-1')).status, 401);
    const locked = await login(http, 'lock@test.local');
    assert.equal(locked.status, 423);
    assert.equal(locked.body.code, 'ACCOUNT_LOCKED');

    await execute("UPDATE users SET locked_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE email = 'lock@test.local'");
    assert.equal((await login(http, 'lock@test.local')).status, 200);
  });

  test('بلا توكن أو بتوكن مزوّر: 401 بكود واضح', async () => {
    const none = await http.get(`${API}/accounts`);
    assert.equal(none.status, 401);
    assert.equal(none.body.code, 'NO_TOKEN');
    const forged = await http.get(`${API}/accounts`).set(bearer('abc.def.ghi'));
    assert.equal(forged.body.code, 'TOKEN_INVALID');
  });
});

describe('تدوير التوكن وكشف السرقة', () => {
  before(() => registerHousehold(http, { email: 'rot@test.local' }));

  const refresh = (token) => http.post(`${API}/auth/refresh`).set('X-Client-Type', 'mobile').send({ refresh_token: token });

  test('التجديد يُصدر توكنًا جديدًا', async () => {
    const first = await login(http, 'rot@test.local', PASSWORD, 'mobile');
    const second = await refresh(first.refreshToken);
    assert.equal(second.status, 200);
    assert.notEqual(second.body.data.tokens.refresh_token, first.refreshToken);
  });

  test('إعادة استخدام توكن قديم بعد نافذة السماح = سرقة، تُلغى السلسلة كلها', async () => {
    const first = await login(http, 'rot@test.local', PASSWORD, 'mobile');
    const second = await refresh(first.refreshToken);
    await execute('UPDATE refresh_tokens SET used_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE used_at IS NOT NULL');

    const replay = await refresh(first.refreshToken);
    assert.equal(replay.body.code, 'SESSION_REUSED');
    const legit = await refresh(second.body.data.tokens.refresh_token);
    assert.equal(legit.body.code, 'SESSION_REVOKED');
  });

  test('قائمة الأجهزة: جلسة واحدة حتى لو تغيّر المتصفّح بين التجديدات', async () => {
    const first = await login(http, 'rot@test.local', PASSWORD, 'mobile');
    await http.post(`${API}/auth/refresh`).set('X-Client-Type', 'mobile').set('User-Agent', 'Other-UA/2.0')
      .send({ refresh_token: first.refreshToken });
    const sessions = await http.get(`${API}/auth/sessions`).set(bearer(first.token));
    const ids = sessions.body.data.map((session) => session.id);
    assert.equal(ids.length, new Set(ids).size);
    // الجلسة تظهر ببيانات آخر تجديد فيها
    assert.ok(sessions.body.data.some((session) => session.user_agent === 'Other-UA/2.0'));
  });

  test('الكوكي بلا ترويسة X-Client-Type مرفوض (حماية CSRF)', async () => {
    const { cookie } = await login(http, 'rot@test.local');
    const blocked = await http.post(`${API}/auth/refresh`).set('Cookie', cookie).send({});
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'CSRF');
    const allowed = await http.post(`${API}/auth/refresh`).set('Cookie', cookie).set('X-Client-Type', 'web').send({});
    assert.equal(allowed.status, 200);
  });
});

describe('كلمة المرور', () => {
  before(() => registerHousehold(http, { email: 'pw@test.local' }));

  test('تغيير الكلمة يُنهي الجلسات الأخرى', async () => {
    const other = await login(http, 'pw@test.local', PASSWORD, 'mobile');
    const current = await login(http, 'pw@test.local');
    const changed = await http.post(`${API}/auth/change-password`).set(bearer(current.token)).set('X-Client-Type', 'web')
      .send({ current_password: PASSWORD, new_password: 'An0ther-Pass-456!' });
    assert.equal(changed.status, 200);

    const stale = await http.post(`${API}/auth/refresh`).set('X-Client-Type', 'mobile').send({ refresh_token: other.refreshToken });
    assert.equal(stale.body.code, 'SESSION_REVOKED');
    assert.equal((await login(http, 'pw@test.local', 'An0ther-Pass-456!')).status, 200);
  });

  test('الكلمة الحالية الخاطئة مرفوضة على الحقل', async () => {
    const { token } = await login(http, 'pw@test.local', 'An0ther-Pass-456!');
    const response = await http.post(`${API}/auth/change-password`).set(bearer(token))
      .send({ current_password: 'not-it-000!', new_password: 'Third-Pass-789!' });
    assert.equal(response.status, 400);
    assert.equal(response.body.errors.current_password, 'غير صحيحة');
  });

  test('نسيت كلمة المرور: نفس الرد للبريد المجهول، ورابط صالح مرّة واحدة', async () => {
    const unknown = await http.post(`${API}/auth/forgot-password`).send({ email: 'ghost@test.local' });
    const known = await http.post(`${API}/auth/forgot-password`).send({ email: 'pw@test.local' });
    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown.body, known.body);

    const mail = outbox.findLast((message) => message.to === 'pw@test.local');
    assert.equal(mail.template, 'password_reset');
    const token = new URL(mail.payload.link).searchParams.get('token');

    const reset = await http.post(`${API}/auth/reset-password`).send({ token, new_password: 'Reset-Pass-321!' });
    assert.equal(reset.status, 200);
    assert.equal((await login(http, 'pw@test.local', 'Reset-Pass-321!')).status, 200);

    const again = await http.post(`${API}/auth/reset-password`).send({ token, new_password: 'Again-Pass-321!' });
    assert.equal(again.body.code, 'RESET_INVALID');
  });

  test('لا تُخزَّن إلا بصمة توكن الاستعادة', async () => {
    const row = await queryOne('SELECT token_hash FROM password_resets ORDER BY id DESC LIMIT 1');
    assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  });
});

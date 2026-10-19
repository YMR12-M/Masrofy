/**
 * أدوات الاختبارات: قاعدة نظيفة، أسرة جاهزة عبر التسجيل، أفراد بأدوار مختلفة.
 *
 * الاختبارات تعمل على قاعدة `masrofy_test` فقط (env.js يرفض أي اسم لا ينتهي
 * بـ _test). كل ملف اختبار يبدأ بقاعدة فارغة.
 */
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { closePool, pool, queryOne } from '../src/config/db.js';
import { migrateUp } from '../src/db/migrate.js';
import { addDays, todayIn } from '../src/utils/dates.js';

export const PASSWORD = 'Str0ng-Pass-123!';
export const API = '/api/v1';

/** «اليوم» بتوقيت القاهرة وتواريخ نسبية له، فلا تتقادم الاختبارات */
export const TODAY = todayIn('Africa/Cairo');
export const day = (n) => addDays(TODAY, n);

export async function resetDatabase() {
  await migrateUp();
  const connection = await pool.getConnection();
  try {
    const [tables] = await connection.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> 'schema_migrations'",
    );
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) await connection.query(`TRUNCATE TABLE \`${name}\``);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    connection.release();
  }
}

export const shutdown = () => closePool();

export function makeApp() {
  const app = createApp();
  return { app, http: request(app) };
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** يسجّل الدخول ويعيد { token, cookie, body } */
export async function login(http, email, password = PASSWORD, clientType = 'web') {
  const response = await http
    .post(`${API}/auth/login`)
    .set('X-Client-Type', clientType)
    .send({ email, password });
  return {
    status: response.status,
    body: response.body,
    token: response.body?.data?.tokens?.access_token,
    refreshToken: response.body?.data?.tokens?.refresh_token,
    cookie: (response.headers['set-cookie'] || [])[0]?.split(';')[0],
    response,
  };
}

let counter = 0;

/** أسرة جديدة عبر شاشة التسجيل نفسها: { token, user, email, api } */
export async function registerHousehold(http, overrides = {}) {
  counter += 1;
  const email = overrides.email ?? `owner${counter}@test.local`;
  const response = await http.post(`${API}/auth/register`).set('X-Client-Type', 'web').send({
    household_name: `أسرة ${counter}`, full_name: 'صاحب الأسرة', email, password: PASSWORD, ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const token = response.body.data.tokens.access_token;
  return { token, user: response.body.data.user, email, api: client(http, token) };
}

/** فرد جديد بدور معيّن، بعد تغيير كلمته المؤقتة: { token, id, api } */
export async function addMember(http, ownerToken, role, name = role) {
  counter += 1;
  const email = `${role}${counter}@test.local`;
  const created = await http.post(`${API}/members`).set(bearer(ownerToken))
    .send({ full_name: `فرد ${name}`, email, role });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const first = await login(http, email, created.body.data.temp_password);
  const changed = await http.post(`${API}/auth/change-password`).set(bearer(first.token)).set('X-Client-Type', 'web')
    .send({ current_password: created.body.data.temp_password, new_password: PASSWORD });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const token = changed.body.data.tokens.access_token;
  return { token, id: created.body.data.member.id, email, api: client(http, token) };
}

/** اختصارات طلبات بتوكن واحد */
export function client(http, token) {
  return {
    get: (path, query) => http.get(`${API}${path}`).query(query ?? {}).set(bearer(token)),
    post: (path, body = {}) => http.post(`${API}${path}`).set(bearer(token)).send(body),
    patch: (path, body = {}) => http.patch(`${API}${path}`).set(bearer(token)).send(body),
    del: (path) => http.delete(`${API}${path}`).set(bearer(token)),
  };
}

/** يتأكد من الكود ويعيد data */
export function expectStatus(response, status) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  return response.body.data;
}

/** حساب جاهز */
export const makeAccount = async (api, overrides = {}) =>
  expectStatus(await api.post('/accounts', { name: `حساب ${(counter += 1)}`, type: 'cash', ...overrides }), 201);

/** أول تصنيف بالاسم (من التصنيفات المقترحة عند التسجيل) */
export async function categoryNamed(api, name) {
  const categories = expectStatus(await api.get('/categories'), 200);
  const category = categories.find((item) => item.name === name);
  assert.ok(category, `التصنيف «${name}» غير موجود`);
  return category;
}

export const record = (api, body) => api.post('/transactions', { occurred_on: TODAY, ...body });

export const mustRecord = async (api, body) => expectStatus(await record(api, body), 201);

export const balanceOf = async (api, accountId) => expectStatus(await api.get(`/accounts/${accountId}`), 200).balance_minor;

export const userRow = (email) => queryOne('SELECT * FROM users WHERE email = ?', [email]);

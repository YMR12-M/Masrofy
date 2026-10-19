# مصروفي — مرجع الـ API

كل المسارات تحت `/api/v1`. المصادقة بترويسة `Authorization: Bearer <access_token>`، والأسرة تُؤخذ من المستخدم نفسه (لا معرّف أسرة في الرابط).

- النجاح: `{ "success": true, "data": … }` — والقوائم المقسّمة تضيف `meta: { page, page_size, total, total_pages }`.
- الفشل: `{ "success": false, "message": "رسالة عربية", "code": "CODE", "errors"?: { "field": "رسالة" } }`.
- المبالغ بالقروش (`amount_minor`)، النسب بالـ basis points، والتواريخ `YYYY-MM-DD`، والشهر المالي `YYYY-MM`.
- `X-Client-Type: web | mobile | desktop` — الويب يستلم توكن التجديد في كوكي httpOnly، والتطبيقات في الجسم.

## المصادقة `/auth`
| الطريقة | المسار | ملاحظات |
|---|---|---|
| GET | `/auth/options` | `{ signup_enabled }` — بلا جلسة |
| POST | `/auth/register` | `{ household_name, full_name, email, phone?, password }` ← أسرة + صاحبها + تصنيفات مقترحة + جلسة (201). `SIGNUP_DISABLED` · `EMAIL_TAKEN` |
| POST | `/auth/login` | `{ email, password }` ← `{ user, tokens }`. `BAD_CREDENTIALS` · `ACCOUNT_LOCKED` (423) |
| POST | `/auth/refresh` | كوكي (+ `X-Client-Type`) أو `{ refresh_token }`. `SESSION_REUSED` يلغي السلسلة كلها |
| POST | `/auth/logout` · `/auth/logout-all` | |
| GET/PATCH | `/auth/me` | `{ full_name?, phone? }` |
| POST | `/auth/change-password` | `{ current_password, new_password }` ← جلسة جديدة، وتُقفل باقي الجلسات |
| POST | `/auth/forgot-password` · `/auth/reset-password` | `{ email }` · `{ token, new_password }` |
| GET / DELETE | `/auth/sessions` · `/auth/sessions/:familyId` | الأجهزة المسجّل منها |

`user` = `{ id, full_name, email, phone, role, must_change_password, household: { id, name, currency, timezone, month_start_day }, permissions[] }`.

## الأسرة والأفراد
| الطريقة | المسار | الصلاحية |
|---|---|---|
| GET | `/household` | الكل |
| PATCH | `/household` | `household.manage` — `{ name?, currency?, timezone?, month_start_day? (1–28) }` |
| GET | `/members` | الكل (البريد والهاتف للمشرف فقط) |
| POST | `/members` | `household.manage` — `{ full_name, email, phone?, role, password? }` ← `{ member, temp_password }` |
| PATCH / DELETE | `/members/:id` | `household.manage` — `{ full_name?, phone?, role?, status? }`. `LAST_OWNER` · `SELF_CHANGE` · `OWNER_ONLY` |
| POST | `/members/:id/temp-password` | `household.manage` |

## الحسابات `/accounts`
- `GET /accounts?include_archived=` ← كل حساب: `balance_minor`, `is_shared`, `can_manage`, `can_record`, `owner_name`.
- `POST /accounts` — `{ name, type: cash|bank|wallet|card|savings|other, scope: shared|private, institution?, opening_balance_minor? (يقبل السالب), credit_limit_minor?, color?, include_in_net_worth? }`. `NAME_TAKEN`.
- `PATCH /accounts/:id` — نفس الحقول + `archived: true|false`.
- `DELETE /accounts/:id` ← 204 لو بلا عمليات، أو `{ archived: true }`.

## التصنيفات `/categories`
- `GET /categories?kind=&include_archived=` ← قائمة مسطّحة مرتّبة (الرئيسي ثم فروعه).
- `POST` (`categories.manage`) — `{ kind, name, parent_id?, icon?, color? }`. `BAD_PARENT` · `NAME_TAKEN`.
- `PATCH /categories/:id` — `{ name?, icon?, color?, parent_id?, archived? }` (النوع لا يتغيّر).
- `DELETE /categories/:id` ← حذف أو أرشفة مع الفروع وشيل ميزانياتها.

## العمليات `/transactions`
- `GET /transactions?from&to&type&account_id&category_id&created_by&q&page&page_size` ← صفوف + `meta.totals: { income_minor, expense_minor }`. التصنيف الرئيسي يشمل فروعه. الطرف الخاص بغيرك يظهر `account_name: "حساب خاص"`.
- `GET /transactions/export?…` ← CSV (UTF-8 + BOM، المصروف بالسالب، حماية من حقن الصيغ).
- `POST /transactions` — `{ type: expense|income|transfer, account_id, amount_minor (> 0), occurred_on, category_id? (للمصروف والدخل), to_account_id? (للتحويل), payee?, note? }`.
- `PATCH /transactions/:id` يدمج ثم يتحقّق من الشكل كاملًا. `DELETE /transactions/:id`.
- أخطاء: `ACCOUNT_ARCHIVED` (409)، `FORBIDDEN` (403 — لا حقّ تسجيل على الحساب)، وأخطاء حقول `category_id` / `to_account_id` / `account_id`.

## الميزانيات `/budgets`
- `GET /budgets?month=YYYY-MM` (`budgets.read`) ← `{ period: { month, from, to, days, elapsed_days, is_current }, budgets: [{ …, spent_minor, remaining_minor, used_bps, status: ok|warning|over }], totals }`.
- `POST` (`budgets.manage`) — `{ category_id (مصروف), amount_minor, alert_bps? (1000–10000، افتراضي 8000) }`. `BUDGET_EXISTS`.
- `PATCH /budgets/:id` — `{ amount_minor?, alert_bps? }` · `DELETE /budgets/:id`.

## التقارير `/reports` (`reports.read`)
- `GET /reports/summary?month=` ← `{ period, totals: { income_minor, expense_minor, net_minor, savings_rate_bps }, previous, by_category: { expense[], income[] }, daily[] }`.
- `GET /reports/trend?months=6&end=YYYY-MM` ← شهور متتالية (الأقدم أولًا) بالدخل والمصروف والصافي.
- `GET /reports/net-worth` ← `{ assets_minor, liabilities_minor, net_minor, accounts[] }`.

كل التقارير والميزانيات محسوبة على الحسابات الظاهرة للمستخدم فقط، والتحويلات خارج الدخل والمصروف.

## السجل `/audit` (`audit.read`)
- `GET /audit?entity=&user_id=&page=` ← `{ action, entity, entity_id, before_json, after_json, user_name, created_at }`.

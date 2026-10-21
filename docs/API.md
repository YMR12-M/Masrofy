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
- `DELETE /accounts/:id` ← 204 لو بلا عمليات ولا فواتير/تقسيط، أو `{ archived: true }`.

## التصنيفات `/categories`
- `GET /categories?kind=&include_archived=` ← قائمة مسطّحة مرتّبة (الرئيسي ثم فروعه).
- `POST` (`categories.manage`) — `{ kind, name, parent_id?, icon?, color? }`. `BAD_PARENT` · `NAME_TAKEN`.
- `PATCH /categories/:id` — `{ name?, icon?, color?, parent_id?, archived? }` (النوع لا يتغيّر).
- `DELETE /categories/:id` ← حذف، أو أرشفة مع الفروع وشيل ميزانياتها لو مستخدم (عمليات، ميزانيات، فروع، فواتير، تقسيط).

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

## الفواتير المتكرّرة `/recurring`
قالب عملية (مصروف/دخل/تحويل) بموعد متكرّر. القراءة `accounts.read|accounts.own`، والكتابة `transactions.write|accounts.own`، وحقّ الحسابات نفسها من `access.js`: القاعدة تظهر لمن يرى **كل** حساباتها، ويعدّلها ويسجّلها من يقدر يسجّل عليها.
- `GET /recurring` ← قواعد مرتّبة بالأقرب معادًا: الحقول المحفوظة + `account_name`, `to_account_name`, `category_name/icon/color`, `next_due_on` (null = خلصت), `remaining_count` (null = بلا نهاية), `last_handled_on`, `problem` (`account_archived` | `category_archived` | null), `can_edit`.
- `GET /recurring/:id` ← نفسه + `history` (آخر 12: `{ due_on, status: posted|skipped, transaction_id }`).
- `POST /recurring` — `{ name, type, account_id, amount_minor, frequency: weekly|monthly|yearly, start_on (أول معاد), interval_count? (1–52، افتراضي 1), category_id? (للمصروف والدخل), to_account_id? (للتحويل), end_on?, total_count? (1–1000، من أول معاد), payee?, note?, auto_post? }`. نفس أخطاء شكل العملية (`category_id`/`to_account_id`/`account_id`، `ACCOUNT_ARCHIVED`)، و`end_on` قبل `start_on` ← خطأ حقل.
- `PATCH /recurring/:id` يدمج ثم يتحقّق كاملًا. تغيير المواعيد لا يمسّ ما اتسجّل.
- `DELETE /recurring/:id` ← 204 (العمليات اللي اتسجّلت منها تفضل).
- `POST /recurring/:id/post` — `{ due_on, occurred_on? (افتراضي النهارده), amount_minor?, account_id?, note? }` ← `{ due_on, already_posted, transaction }`: **201** لو اتسجّلت عملية جديدة، و**200** بنفس العملية لو المعاد كان متسجّل (ضغطة مكرّرة أو متزامنة). `due_on` لازم يكون من مواعيدها وداخل نهايتها (وإلا خطأ حقل `due_on`). `ALREADY_SKIPPED` (409).
- `POST /recurring/:id/skip` — `{ due_on }` ← `{ due_on, already_skipped }`. `ALREADY_POSTED` (409).
- المعاد رقم n = أول معاد + n×التكرار، مقصوص على آخر الشهر: يوم 31 ← 28/29 فبراير ← 31 مارس. حذف العملية المولّدة يرجّع المعاد مستحقًّا.
- التلقائي (`auto_post: true`) تسجّله مهمة السيرفر في معاده بتاريخه وباسم منشئ القاعدة.

## التقسيط `/installments`
نفس البوّابات. الخطّة تظهر لمن يرى حسابها.
- `GET /installments` ← خطط: الحقول + `total_minor`, `paid_minor`, `remaining_minor`, `paid_bps`, `installments_paid`, `overdue_count`, `next_item: { id, seq, due_on, amount_minor, status }`, `done`, `problem`, `can_edit`.
- `GET /installments/:id` ← نفسه + `items: [{ id, seq (0 = المقدّم), due_on, amount_minor, paid, status: paid|settled|overdue|today|upcoming, transaction_id, paid_on, settled_at }]` (`transaction_id`/`paid_on` = null لو سدّده غيرك من جيبه الخاص).
- `POST /installments` — `{ name, account_id, category_id (مصروف), total_minor (بالفوايد), installment_count (1–120), first_due_on, down_payment_minor? (0), purchase_on? (معاد المقدّم؛ افتراضي النهارده أو أول قسط لو فات), payee?, note? }`. الأقساط شهرية من `first_due_on` ومتساوية، والأخير ياخد باقي القسمة. أخطاء حقول: `down_payment_minor` (≥ الإجمالي)، `installment_count` (أكتر من الباقي بالقرش)، `first_due_on` (قبل الشراء).
- `PATCH /installments/:id` — نفس الحقول. الاسم/الجهة/الحساب/التصنيف دايمًا؛ المبلغ والعدد والمواعيد يعيدوا توليد الجدول بشرط ما يكونش اتدفع حاجة، وإلا `PLAN_HAS_PAYMENTS` (409).
- `DELETE /installments/:id` ← 204 (العمليات تفضل).
- `POST /installments/:id/items/:itemId/pay` — `{ occurred_on?, account_id?, note? }` ← مصروف بمبلغ القسط: `{ item_id, already_paid, transaction }` (201، أو 200 لو كان متسجّل). `ALREADY_SETTLED` (409).
- `PATCH /installments/:id/items/:itemId` — `{ settled: true|false }` «اتدفع قبل كده» بلا عملية (أو إلغاؤها) ← الخطّة كاملة. `ALREADY_PAID` (409) لو القسط متسجّل كعملية (احذف العملية لترجيعه).

## المستحقّ `/bills`
- `GET /bills/due?from&to` (`accounts.read|accounts.own`) ← `{ today, from, to, items, sources: { recurring, installments } }`. `to` افتراضيًّا النهارده + 30، ومن غير `from` يشمل كل المتأخر. كل بند: `{ key, source: recurring|installment, source_id, item_id, due_on, status: overdue|today|upcoming, name, type, amount_minor, payee, account_id/name, to_account_id/name, category_*, frequency, interval_count, auto_post, installment: { seq, count } | null, problem, can_post }` مرتّب بالتاريخ. `sources` = عدد الفواتير/الخطط اللي لسه ليها مواعيد.

## التقارير `/reports` (`reports.read`)
- `GET /reports/summary?month=` ← `{ period, totals: { income_minor, expense_minor, net_minor, savings_rate_bps }, previous, by_category: { expense[], income[] }, daily[] }`.
- `GET /reports/trend?months=6&end=YYYY-MM` ← شهور متتالية (الأقدم أولًا) بالدخل والمصروف والصافي.
- `GET /reports/net-worth` ← `{ assets_minor, liabilities_minor, net_minor, accounts[] }`.

كل التقارير والميزانيات محسوبة على الحسابات الظاهرة للمستخدم فقط، والتحويلات خارج الدخل والمصروف.

## السجل `/audit` (`audit.read`)
- `GET /audit?entity=&user_id=&page=` ← `{ action, entity, entity_id, before_json, after_json, user_name, created_at }`.

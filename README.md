# مصروفي

تطبيق مصروفات شخصية وعائلية للسوق المصري: الأسرة كلها تسجّل في مكان واحد، وكل فرد له جيبه الخاص.

**المكدّس:** HTML · CSS · JavaScript · React (Vite) · Node.js · Express · MySQL

## الموجود الآن

- **الأسرة والأفراد:** حساب أسرة بالتسجيل، أفراد بأدوار (صاحب الأسرة، مشرف، فرد، ابن/ابنة، مشاهدة فقط)، كلمة مؤقتة للفرد الجديد.
- **الحسابات:** كاش، بنك، محفظة إلكترونية، بطاقة ائتمان، ادخار — مشتركة للأسرة أو **خاصة** لا يراها غير صاحبها.
- **العمليات:** مصروف، دخل، تحويل بين حسابين، بفلاتر وبحث وتصدير CSV يفتحه Excel بالعربي.
- **التصنيفات:** شجرة من مستويين، وتصنيفات مقترحة جاهزة عند التسجيل (بلا أي بيانات وهمية).
- **الميزانيات:** حدّ شهري لكل تصنيف وتنبيه عند نسبة تختارها.
- **الشهر المالي:** يبدأ من يوم القبض (1 – 28) لا من أول الشهر بالضرورة.
- **التقارير:** ملخّص الشهر ومقارنته بالسابق، الصرف حسب التصنيف، الصرف اليومي، اتجاه 6 شهور، صافي الثروة.
- **الأمان:** JWT قصير + توكن تجديد دوّار مع كشف السرقة، قفل الحساب بعد محاولات فاشلة، سجل تغييرات.
- واجهة عربية (RTL) بوضع فاتح وداكن، تعمل على الموبايل والكمبيوتر.

## هيكل المشروع

```
Masrofy/
├── server/                     ← الـ API (Express + MySQL) — بورت 4020
│   ├── src/
│   │   ├── server.js           نقطة الإقلاع والإيقاف النظيف
│   │   ├── app.js              تركيب Express (أمان ← تحليل ← مسارات ← أخطاء)
│   │   ├── config/             البيئة، القاعدة، الصلاحيات، التصنيفات المقترحة
│   │   ├── db/                 مشغّل الهجرات + bootstrap + migrations/*.sql
│   │   ├── middleware/         المصادقة، التفويض، التحقّق، حدود المعدّل، الأخطاء
│   │   ├── modules/            وحدة لكل مورد: routes ← controller ← service (+ validation)
│   │   │   ├── auth/  household/  members/
│   │   │   ├── accounts/       (access.js = قاعدة الحسابات الخاصة والمشتركة)
│   │   │   ├── categories/  transactions/  budgets/  reports/  audit/
│   │   ├── routes/index.js     ربط الوحدات تحت /api/v1
│   │   ├── services/mailer.js  البريد
│   │   └── utils/              الفلوس، التواريخ والشهر المالي، الأمان، CSV…
│   └── test/                   اختبارات تكامل (node:test + supertest)
├── client/                     ← واجهة الويب (React + Vite) — بورت 5190
│   └── src/
│       ├── main.jsx · App.jsx  المزوّدات والمسارات
│       ├── styles/             tokens (الألوان والمقاسات) ← base ← components ← layout ← pages
│       ├── lib/                api، format، period، queries، forms، hooks، icons، constants
│       ├── context/            Auth · Theme · Toast
│       ├── components/
│       │   ├── ui/             مكتبة العناصر المشتركة (Controls · Display · Overlays)
│       │   ├── layout/         Shell (الهيكل) · AuthLayout
│       │   └── transactions/ accounts/ categories/ budgets/ reports/
│       └── pages/              صفحة لكل مسار
└── docs/
    ├── PLAN.md                 الخطّة والنطاق الكامل
    ├── STATUS.md               حالة التنفيذ والأعراف والخطوات الجاية
    └── API.md                  مرجع المسارات
```

## التشغيل محليًا

المتطلبات: Node 22+ و MySQL 8+ (الإعداد الافتراضي: حساب `root` بلا كلمة سر).

```bash
cd server && npm install && npm run db:setup
```

```bash
cd server && npm run dev
```

```bash
cd client && npm install && npm run dev
```

افتح http://localhost:5190 واختار «افتح حساب لأسرتك».

- الإعدادات في `server/.env` (انسخ `server/.env.example`). بدونه تعمل القيم الافتراضية للتطوير.
- لنشر خاص بأسرة واحدة: `ALLOW_SIGNUP=false` ثم `npm run db:bootstrap` لإنشاء الحساب الأول.

## الاختبارات

```bash
cd server && npm test
```

```bash
cd client && npm test
```

اختبارات السيرفر تعمل على قاعدة `masrofy_test` وتمسح بياناتها (السيرفر يرفض أي قاعدة اختبار لا ينتهي اسمها بـ `_test`).

## أعراف الكود

التفاصيل في [docs/STATUS.md](docs/STATUS.md). أهمها: المال أعداد صحيحة بالقروش، التواريخ `YYYY-MM-DD`، ردود `{ success, data }`، تعليقات عربية، والألوان من `tokens.css` فقط.

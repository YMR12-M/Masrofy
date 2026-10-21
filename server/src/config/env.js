/**
 * ═══════════════════════════════════════════════════════════════
 *  تحميل متغيّرات البيئة والتحقّق منها في مكان واحد.
 *
 *  فلسفة هذا الملف: **الفشل مبكرًا وبصوت عالٍ**. أي إعداد ناقص أو
 *  خطير يوقف السيرفر عند الإقلاع برسالة عربية واضحة، بدل ما يتحوّل
 *  إلى خطأ غامض بعد أسبوع من التشغيل.
 *
 *  المتغيّرات تُحمَّل بواسطة Node نفسه (`--env-file-if-exists=.env`)،
 *  فلا حاجة لمكتبة dotenv.
 * ═══════════════════════════════════════════════════════════════
 */
const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

/** أخطاء الإعداد تُجمَّع كلها ثم تُعرض دفعةً واحدة */
const problems = [];

const read = (key, fallback) => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

function required(key, fallback) {
  const value = read(key, fallback);
  if (value === undefined || value === '') problems.push(`${key} مفقود`);
  return value;
}

/** سرٌّ لا يُقبل افتراضيًا ولا قصيرًا في الإنتاج */
function secret(key, devFallback) {
  const value = read(key, isProd ? undefined : devFallback);
  if (!isProd) return value;

  if (!value) {
    problems.push(`${key} مفقود — ولّده بـ:  openssl rand -base64 48`);
  } else if (value.length < 32) {
    problems.push(`${key} قصير جدًا (${value.length} حرفًا) — الحدّ الأدنى 32`);
  } else if (/change-?me|dev-only|placeholder|example/i.test(value)) {
    problems.push(`${key} ما زال بالقيمة الافتراضية — غيّره قبل النشر`);
  }
  return value;
}

const bool = (key, fallback = false) => {
  const value = read(key);
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const num = (key, fallback) => {
  const value = read(key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    problems.push(`${key} يجب أن يكون رقمًا (القيمة الحالية: ${value})`);
    return fallback;
  }
  return parsed;
};

const list = (key, fallback = '') =>
  String(read(key, fallback)).split(',').map((item) => item.trim()).filter(Boolean);

/* ═══════════════════════════════════════════════════════════════ */

const clientOrigin = list('CLIENT_ORIGIN', 'http://localhost:5190,http://localhost:5191');
if (isProd && clientOrigin.some((origin) => origin.includes('localhost') || origin === '*')) {
  problems.push('CLIENT_ORIGIN يحتوي localhost أو * — اضبطه على نطاقاتك فقط في الإنتاج');
}

const sameSite = String(read('COOKIE_SAMESITE', 'lax')).toLowerCase();
if (!['lax', 'strict', 'none'].includes(sameSite)) {
  problems.push(`COOKIE_SAMESITE يجب أن تكون lax أو strict أو none (الحالية: ${sameSite})`);
}
const cookieSecure = bool('COOKIE_SECURE', isProd);
if (sameSite === 'none' && !cookieSecure) {
  problems.push('COOKIE_SAMESITE=none يتطلّب COOKIE_SECURE=true — المتصفّح يرفض غير ذلك');
}
if (isProd && !cookieSecure) {
  problems.push('COOKIE_SECURE لازم true في الإنتاج (HTTPS)');
}

const dbName = isTest ? read('DB_NAME_TEST', 'masrofy_test') : required('DB_NAME', 'masrofy');
if (isTest && !String(dbName).endsWith('_test')) {
  problems.push(`قاعدة الاختبارات يجب أن ينتهي اسمها بـ _test (الحالية: ${dbName}) — الاختبارات تمسح بياناتها`);
}

// التسجيل التلقائي للفواتير: شغّال افتراضيًّا، ومقفول دائمًا في الاختبارات (تستدعي الدالة بنفسها)
const autoPostEnabled = !isTest && bool('AUTO_POST_ENABLED', true);
const autoPostMinutes = num('AUTO_POST_INTERVAL_MINUTES', 60);
if (autoPostEnabled && !(autoPostMinutes >= 1)) {
  problems.push(`AUTO_POST_INTERVAL_MINUTES لازم دقيقة أو أكتر (الحالية: ${autoPostMinutes})`);
}

const smtpHost = read('SMTP_HOST', '');
const mailDisabled = bool('MAIL_DISABLED', false);
if (isProd && !smtpHost && !mailDisabled) {
  problems.push('SMTP_HOST مطلوب في الإنتاج — أو MAIL_DISABLED=true صراحةً لو مش هتبعت بريد');
}

export const env = {
  nodeEnv,
  isProd,
  isTest,
  port: num('PORT', 4020),
  apiPrefix: read('API_PREFIX', '/api/v1'),
  clientOrigin,
  appUrl: read('APP_URL', clientOrigin[0] || 'http://localhost:5190'),

  db: {
    host: required('DB_HOST', '127.0.0.1'),
    port: num('DB_PORT', 3306),
    user: required('DB_USER', 'root'),
    password: read('DB_PASSWORD', ''),
    database: dbName,
    connectionLimit: num('DB_CONNECTION_LIMIT', 10),
    ssl: bool('DB_SSL', false),
  },

  jwt: {
    accessSecret: secret('JWT_ACCESS_SECRET', 'dev-only-access-secret-not-for-production'),
    accessTtl: read('JWT_ACCESS_TTL', '15m'),
    refreshTtl: read('JWT_REFRESH_TTL', '30d'),
    refreshTtlApp: read('JWT_REFRESH_TTL_APP', '90d'),
  },

  auth: {
    bcryptRounds: num('BCRYPT_ROUNDS', isTest ? 4 : 12),
    maxFailedLogins: num('MAX_FAILED_LOGINS', 5),
    lockMinutes: num('LOCK_MINUTES', 15),
  },

  cookie: {
    name: 'masrofy_rt',
    secure: cookieSecure,
    sameSite,
    domain: read('COOKIE_DOMAIN', ''),
  },

  mail: {
    disabled: mailDisabled,
    host: smtpHost,
    port: num('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: read('SMTP_USER', ''),
    pass: read('SMTP_PASS', ''),
    from: read('MAIL_FROM', 'مصروفي <no-reply@example.com>'),
  },

  signupEnabled: bool('ALLOW_SIGNUP', true),

  autoPost: {
    enabled: autoPostEnabled,
    intervalMinutes: autoPostMinutes,
  },
};

if (problems.length > 0) {
  const lines = problems.map((problem) => `   ✗ ${problem}`).join('\n');
  throw new Error(
    `\n\n  ✖ إعدادات البيئة غير مكتملة (server/.env)\n\n${lines}\n\n`
    + '  راجع server/.env.example — كل متغيّر موثّق فيه.\n',
  );
}

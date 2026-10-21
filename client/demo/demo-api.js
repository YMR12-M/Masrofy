/* ============================================
   النسخة التجريبية (عرض فقط) - النواة المشتركة

   بتعترض طلبات fetch لمسار الـ API وبترد عليها من بيانات وهمية متخزنة في
   localStorage عند الزائر نفسه. مفيش سيرفر ولا قاعدة بيانات: كل زائر معاه
   نسخته الخاصة، ومفيش أي حاجة بتتبعت لأي مكان.

   الملف ده مش بيتحمّل في النسخة الحقيقية خالص - بيتحط في index.html بتاع
   النسخة التجريبية بس (demo/inject.mjs). ومفيش أي تعديل على كود الواجهة.
   ============================================ */

function createDemo(cfg) {
  'use strict';

  var pad = function (n) {
    return String(n).padStart(2, '0');
  };

  var H = {
    pad: pad,
    now: function () {
      return Date.now();
    },
    // "YYYY-MM-DD HH:MM:SS" بتوقيت UTC (زي DATETIME من MySQL)
    utc: function (ms) {
      var d = new Date(ms);
      return (
        d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' +
        pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds())
      );
    },
    day: function (ms) {
      return H.utc(ms).slice(0, 10);
    },
    iso: function (ms) {
      return new Date(ms).toISOString();
    },
    // أيام نسبية لـ "النهارده" بتوقيت الزائر (YYYY-MM-DD)
    localDay: function (offset) {
      var d = new Date();
      d.setDate(d.getDate() + (offset || 0));
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    },
    // رقم ثابت 0..999 من نص: عشان البيانات المتولّدة تبقى متكررة مش عشوائية
    hash: function (str) {
      var h = 2166136261;
      str = String(str);
      for (var i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0) % 1000;
    },
    code: function (length, alphabet) {
      alphabet = alphabet || 'abcdefghijklmnopqrstuvwxyz0123456789';
      var out = '';
      for (var i = 0; i < length; i += 1) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      return out;
    },
    ok: function (body, status) {
      return { status: status || 200, body: body };
    },
    seq: function (db, kind) {
      db.seq = db.seq || {};
      db.seq[kind] = (db.seq[kind] || 0) + 1;
      return db.seq[kind];
    },
    clone: function (value) {
      return JSON.parse(JSON.stringify(value));
    },
  };

  var db = null;

  function load() {
    try {
      var raw = localStorage.getItem(cfg.key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.__v === cfg.version) return parsed;
      }
    } catch (e) {
      /* التخزين المحلي مقفول - هنكمّل من الذاكرة */
    }
    return null;
  }

  function save() {
    try {
      localStorage.setItem(cfg.key, JSON.stringify(db));
    } catch (e) {
      /* الكوتا خلصت أو التخزين مقفول - الجلسة الحالية شغّالة من الذاكرة */
    }
  }

  function reset() {
    db = { __v: cfg.version, seq: {} };
    cfg.seed(db, H);
    save();
  }

  db = load();
  if (!db) reset();

  /* ---------- اعتراض fetch ---------- */

  var prefixes = [].concat(cfg.prefix);
  var realFetch = window.fetch.bind(window);

  function matchPrefix(pathname) {
    for (var i = 0; i < prefixes.length; i += 1) {
      var p = prefixes[i];
      if (pathname === p || pathname.indexOf(p + '/') === 0) return pathname.slice(p.length) || '/';
    }
    return null;
  }

  function headerValue(headers, name) {
    if (!headers) return undefined;
    if (typeof headers.get === 'function') return headers.get(name);
    var lower = name.toLowerCase();
    for (var k in headers) if (k.toLowerCase() === lower) return headers[k];
    return undefined;
  }

  window.fetch = function (input, init) {
    var raw = typeof input === 'string' ? input : input && (input.url || input.href);
    var parsed;
    try {
      parsed = new URL(raw, window.location.origin);
    } catch (e) {
      return realFetch(input, init);
    }
    var path = parsed.origin === window.location.origin ? matchPrefix(parsed.pathname) : null;
    if (path === null) return realFetch(input, init);

    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var headers = (init && init.headers) || (input && input.headers) || {};
    var body = null;
    var rawBody = init && init.body;
    if (typeof rawBody === 'string' && rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (e) {
        body = null;
      }
    }
    var query = {};
    parsed.searchParams.forEach(function (v, k) {
      query[k] = v;
    });

    var result;
    try {
      result = cfg.handle({ method: method, path: path, query: query, body: body, headers: headers, header: function (n) { return headerValue(headers, n); } }, db, H);
      if (!result) result = { status: 404, body: cfg.notFound ? cfg.notFound(path) : { message: 'المسار ده مش موجود في النسخة التجريبية' } };
      save();
    } catch (e) {
      if (window.console) console.error('[demo]', e);
      result = { status: 500, body: cfg.serverError ? cfg.serverError() : { message: 'حصل خطأ في النسخة التجريبية' } };
    }

    return new Promise(function (resolve) {
      setTimeout(function () {
        var h = Object.assign({ 'Content-Type': 'application/json' }, result.headers || {});
        var payload = result.status === 204 ? null : result.raw ? result.body : JSON.stringify(result.body);
        resolve(new Response(payload, { status: result.status, headers: h }));
      }, 40 + Math.floor(Math.random() * 80));
    });
  };

  /* ---------- شريط التجربة ---------- */

  var API = {
    db: function () {
      return db;
    },
    H: H,
    save: save,
    reset: function () {
      try {
        localStorage.removeItem(cfg.key);
      } catch (e) {
        /* لا شيء */
      }
      if (cfg.onReset) cfg.onReset();
      window.location.href = cfg.home || '/';
    },
    go: function (url) {
      save();
      window.location.href = url || cfg.home || '/';
    },
  };

  function mountBar() {
    if (document.getElementById('demo-bar')) return;
    var bar = cfg.bar || {};
    var style = document.createElement('style');
    style.textContent =
      '#demo-bar{position:fixed;left:10px;bottom:10px;z-index:2147483000;font-family:inherit;direction:rtl;font-size:13px;line-height:1.5}' +
      '#demo-bar *{box-sizing:border-box}' +
      '#demo-toggle{display:flex;align-items:center;gap:6px;background:#1c1c24;color:#fff;border:1px solid rgba(255,255,255,.28);' +
      'border-radius:999px;padding:7px 13px;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35)}' +
      '#demo-toggle i{width:8px;height:8px;border-radius:50%;background:#f5b93a;display:inline-block}' +
      '#demo-panel{display:none;position:absolute;left:0;bottom:calc(100% + 8px);width:min(290px,calc(100vw - 20px));' +
      'background:#fff;color:#1c1c24;border:1px solid #d6d6dc;border-radius:14px;padding:12px;box-shadow:0 12px 32px rgba(0,0,0,.3)}' +
      '#demo-panel p{margin:0 0 8px;font-size:12.5px;color:#454552}' +
      '#demo-panel button{display:block;width:100%;margin-top:6px;padding:9px 11px;border-radius:10px;border:1px solid #1c1c24;' +
      'background:#fff;color:#1c1c24;font:inherit;font-weight:700;text-align:right;cursor:pointer}' +
      '#demo-panel button.primary{background:#1c1c24;color:#fff}' +
      '#demo-panel small{display:block;margin-top:9px;font-size:11.5px;color:#6a6a78}' +
      // قواعد إضافية خاصة بكل مشروع (رفع الزرار فوق شريط سفلي مثلًا)
      (bar.css || '');
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'demo-bar';
    var actions = (bar.actions || [])
      .map(function (a, i) {
        return '<button type="button" class="' + (a.primary ? 'primary' : '') + '" data-i="' + i + '"></button>';
      })
      .join('');
    wrap.innerHTML =
      '<div id="demo-panel" role="dialog" aria-label="خيارات النسخة التجريبية">' +
      '<p></p>' + actions +
      '<button type="button" data-reset="1">إعادة ضبط البيانات</button><small></small></div>' +
      '<button id="demo-toggle" type="button" aria-expanded="false" aria-controls="demo-panel"><i></i><span></span></button>';
    document.body.appendChild(wrap);

    var panel = wrap.querySelector('#demo-panel');
    var toggle = wrap.querySelector('#demo-toggle');
    toggle.querySelector('span').textContent = bar.label || 'نسخة تجريبية';
    panel.querySelector('p').textContent =
      bar.intro || 'ده عرض للتطبيق ببيانات وهمية متخزنة على جهازك بس.';
    panel.querySelector('small').textContent = bar.note || '';
    (bar.actions || []).forEach(function (a, i) {
      panel.querySelector('button[data-i="' + i + '"]').textContent = a.label;
    });

    function setOpen(open) {
      panel.style.display = open ? 'block' : 'none';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () {
      setOpen(panel.style.display !== 'block');
    });
    panel.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-reset')) return API.reset();
      var idx = t.getAttribute('data-i');
      if (idx !== null && bar.actions[Number(idx)]) bar.actions[Number(idx)].run(API);
    });
    if (bar.openFirst && !sessionStorage.getItem(cfg.key + ':seen')) {
      try {
        sessionStorage.setItem(cfg.key + ':seen', '1');
      } catch (e) {
        /* لا شيء */
      }
      setOpen(true);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBar);
  else mountBar();

  return API;
}
/* ============================================
   مصروفي - الباك إند التجريبي
   أسرة مصرية وهمية كاملة (حسابات وعمليات وميزانيات وفواتير وأقساط وتقارير)
   متخزنة في localStorage الزائر.
   الأشكال والقواعد مطابقة لـ server/src/modules/* (الغلاف {success, data, meta}):
   الفلوس بالقروش، والنسب بالـ basis points، والتواريخ نصوص YYYY-MM-DD،
   والحساب الخاص ما يشوفوش غير صاحبه.
   ============================================ */

(function () {
  'use strict';

  const DEMO_PASSWORD = 'Masrofy@2026';
  const TZ = 'Africa/Cairo';
  const MS_DAY = 86400000;
  const PRIVATE_NAME = 'حساب خاص';

  /* ---------- التواريخ (نفس server/src/utils/dates.js) ---------- */

  const parseIso = (iso) => new Date(iso + 'T00:00:00Z');
  const toIso = (date) => date.toISOString().slice(0, 10);
  const isValidIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseIso(v).getTime()) && toIso(parseIso(v)) === v;
  const isValidMonth = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  const addDays = (iso, n) => toIso(new Date(parseIso(iso).getTime() + n * MS_DAY));
  const diffDays = (a, b) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / MS_DAY);
  const eachDay = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
  const weekday = (iso) => parseIso(iso).getUTCDay();
  function todayIn(tz) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {
      return toIso(new Date());
    }
  }
  function addMonths(key, count) {
    const [y, m] = key.split('-').map(Number);
    const index = y * 12 + (m - 1) + count;
    return Math.floor(index / 12) + '-' + String((index % 12) + 1).padStart(2, '0');
  }
  const dayOf = (key, day) => key + '-' + String(day).padStart(2, '0');
  const periodRange = (key, start) => ({ month: key, from: dayOf(key, start || 1), to: addDays(dayOf(addMonths(key, 1), start || 1), -1) });
  const periodOf = (iso, start) => { const key = iso.slice(0, 7); return Number(iso.slice(8, 10)) >= (start || 1) ? key : addMonths(key, -1); };

  /* ---------- مواعيد التكرار (نفس server/src/modules/recurring/schedule.js) ---------- */

  const MAX_SCAN = 2000;
  const monthOf = (iso) => iso.slice(0, 7);
  const dayNumber = (iso) => Number(iso.slice(8, 10));
  function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function monthsBetween(a, b) { const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number); return (by * 12 + bm) - (ay * 12 + am); }
  const clampedDay = (key, day) => key + '-' + String(Math.min(day, daysInMonth(key))).padStart(2, '0');
  const monthStep = (rule) => (rule.frequency === 'weekly' ? 0 : (rule.frequency === 'yearly' ? 12 : 1) * (rule.interval_count || 1));
  function occurrenceAt(rule, n) {
    if (rule.frequency === 'weekly') return addDays(rule.start_on, 7 * (rule.interval_count || 1) * n);
    return clampedDay(addMonths(monthOf(rule.start_on), monthStep(rule) * n), dayNumber(rule.start_on));
  }
  function indexOnOrAfter(rule, date) {
    if (date <= rule.start_on) return 0;
    if (rule.frequency === 'weekly') return Math.ceil(diffDays(rule.start_on, date) / (7 * (rule.interval_count || 1)));
    let n = Math.max(0, Math.floor(monthsBetween(monthOf(rule.start_on), monthOf(date)) / monthStep(rule)));
    while (occurrenceAt(rule, n) < date) n += 1;
    return n;
  }
  function withinEnd(rule, n, date) {
    date = date || occurrenceAt(rule, n);
    if (rule.total_count !== null && rule.total_count !== undefined && n >= rule.total_count) return false;
    if (rule.end_on && date > rule.end_on) return false;
    return true;
  }
  function occurrenceIndex(rule, date) {
    const n = indexOnOrAfter(rule, date);
    return occurrenceAt(rule, n) === date && withinEnd(rule, n, date) ? n : -1;
  }
  function occurrencesBetween(rule, opts) {
    opts = opts || {};
    const limit = opts.limit || MAX_SCAN;
    const result = [];
    for (let n = opts.from ? indexOnOrAfter(rule, opts.from) : 0, scanned = 0; scanned < MAX_SCAN && result.length < limit; n += 1, scanned += 1) {
      const date = occurrenceAt(rule, n);
      if ((opts.to && date > opts.to) || !withinEnd(rule, n, date)) break;
      result.push({ seq: n, due_on: date });
    }
    return result;
  }
  function nextPending(rule, handled) {
    for (let n = 0; n < MAX_SCAN; n += 1) {
      const date = occurrenceAt(rule, n);
      if (!withinEnd(rule, n, date)) return null;
      if (!handled.has(date)) return { seq: n, due_on: date };
    }
    return null;
  }
  function remainingCount(rule, handled) {
    if (!rule.end_on && (rule.total_count === null || rule.total_count === undefined)) return null;
    return occurrencesBetween(rule).filter((item) => !handled.has(item.due_on)).length;
  }

  /* ---------- الفلوس والأدوار ---------- */

  const roundHalfUp = (v) => (v < 0 ? -Math.round(-v) : Math.round(v));
  const ratioBps = (part, whole) => (whole > 0 ? roundHalfUp((part * 10000) / whole) : 0);
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  const ALL_PERMISSIONS = ['household.manage', 'accounts.read', 'accounts.manage', 'accounts.own', 'transactions.write',
    'categories.manage', 'budgets.read', 'budgets.manage', 'reports.read', 'audit.read'];
  const ROLES = ['owner', 'admin', 'member', 'child', 'viewer'];
  const ROLE_PERMISSIONS = {
    owner: ALL_PERMISSIONS,
    admin: ALL_PERMISSIONS,
    member: ['accounts.read', 'accounts.own', 'transactions.write', 'budgets.read', 'reports.read'],
    child: ['accounts.own', 'reports.read'],
    viewer: ['accounts.read', 'budgets.read', 'reports.read'],
  };
  const can = (role, permission) => (ROLE_PERMISSIONS[role] || []).indexOf(permission) >= 0;

  /* ---------- الردود والأخطاء ---------- */

  const ok = (data, status) => ({ status: status || 200, body: { success: true, data: data === undefined ? null : data } });
  const created = (data) => ok(data, 201);
  const paged = (rows, meta) => ({ status: 200, body: { success: true, data: rows, meta } });
  const noContent = () => ({ status: 204, body: null });
  const pageMeta = (page, size, total) => ({ page, page_size: size, total, total_pages: Math.max(1, Math.ceil(total / size)) });

  function fail(status, message, code, errors) {
    const error = new Error(message);
    error.demo = { status, body: { success: false, message, code: code || null, ...(errors ? { errors } : {}) } };
    return error;
  }
  const forbidden = (message, errors) => fail(403, message || 'لا تملك صلاحية لهذا الإجراء', 'FORBIDDEN', errors);
  const notFound = (message) => fail(404, message || 'العنصر المطلوب غير موجود', null);
  const conflict = (message, code, errors) => fail(409, message, code, errors);
  const fieldError = (field, message, code) => fail(422, message, code || 'VALIDATION_ERROR', { [field]: message });

  /* ---------- التحقّق من المدخلات (رسائل Zod بالعربي زي السيرفر) ---------- */

  const empty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  const V = {
    text(v, o) {
      o = o || {};
      if (empty(v)) return o.required ? 'الحقل مطلوب' : null;
      if (typeof v !== 'string') return 'نوع القيمة غير صحيح (المطلوب: نص)';
      if (o.min && v.trim().length < o.min) return 'لازم ' + o.min + ' حروف على الأقل';
      return v.trim().length > (o.max || 190) ? 'الحدّ الأقصى ' + (o.max || 190) + ' حرفًا' : null;
    },
    money(v, o) {
      o = o || {};
      if (v === undefined || v === null) return o.required ? 'الحقل مطلوب' : null;
      if (typeof v !== 'number' || !Number.isInteger(v)) return 'المبلغ بالقروش — عدد صحيح';
      const min = o.min === undefined ? 1 : o.min;
      if (v < min) return min === 1 ? 'المبلغ لازم أكبر من صفر' : 'القيمة لازم تكون أكبر من أو تساوي ' + min;
      return Math.abs(v) > 100000000000 ? 'القيمة لازم تكون أقل من أو تساوي 100000000000' : null;
    },
    int(v, o) {
      if (v === undefined || v === null) return o.required ? 'الحقل مطلوب' : null;
      if (typeof v !== 'number' || !Number.isInteger(v)) return 'نوع القيمة غير صحيح (المطلوب: رقم)';
      if (v < o.min) return o.minMessage || 'القيمة لازم تكون أكبر من أو تساوي ' + o.min;
      return v > o.max ? o.maxMessage || 'القيمة لازم تكون أقل من أو تساوي ' + o.max : null;
    },
    date(v, o) {
      o = o || {};
      if (empty(v)) return o.required ? 'الحقل مطلوب' : null;
      if (!isValidIso(v)) return 'التاريخ لازم بصيغة YYYY-MM-DD وصالح';
      return v < '2000-01-01' || v > '2100-12-31' ? 'التاريخ خارج المدى المعقول' : null;
    },
    oneOf(v, list, o) {
      o = o || {};
      if (v === undefined || v === null) return o.required ? 'الحقل مطلوب' : null;
      return list.indexOf(v) >= 0 ? null : 'القيمة غير مسموحة (المسموح: ' + list.join('، ') + ')';
    },
    id(v, o) {
      o = o || {};
      if (empty(v)) return o.required ? 'الحقل مطلوب' : null;
      return Number.isInteger(Number(v)) && Number(v) > 0 ? null : 'نوع القيمة غير صحيح (المطلوب: رقم)';
    },
    bool(v) {
      return v === undefined || typeof v === 'boolean' ? null : 'نوع القيمة غير صحيح (المطلوب: نعم/لا)';
    },
    email(v, o) {
      if (empty(v)) return o && o.required ? 'الحقل مطلوب' : null;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? null : 'بريد إلكتروني غير صالح';
    },
    password(v) {
      if (empty(v)) return 'الحقل مطلوب';
      const issues = [];
      if (v.length < 10) issues.push('10 حروف على الأقل');
      const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((p) => p.test(v)).length;
      if (classes < 2 && v.length < 16) issues.push('تجمع نوعين على الأقل: حروف، أرقام، رموز (أو تكون 16 حرفًا فأكثر)');
      if (/^(.)\1+$/.test(v)) issues.push('ليست حرفًا مكرّرًا');
      return issues.length ? 'كلمة المرور لازم: ' + issues.join('، ') : null;
    },
    phone(v) {
      if (empty(v)) return null;
      return String(v).replace(/\D/g, '').length >= 7 ? null : 'رقم هاتف غير صالح';
    },
    color(v) {
      return v === undefined || /^#[0-9a-fA-F]{6}$/.test(v) ? null : 'اللون بصيغة #RRGGBB';
    },
  };
  function check(map) {
    const errors = {};
    Object.keys(map).forEach((key) => { if (map[key]) errors[key] = map[key]; });
    if (Object.keys(errors).length) throw fail(422, 'تحقّق من البيانات المُدخلة', 'VALIDATION_ERROR', errors);
  }
  function strict(body, allowed) {
    const extra = Object.keys(body || {}).filter((key) => allowed.indexOf(key) < 0);
    if (extra.length) throw fail(422, 'تحقّق من البيانات المُدخلة', 'VALIDATION_ERROR', { body: 'حقول غير معروفة: ' + extra.join('، ') });
  }
  const optText = (v) => (v === undefined ? undefined : v === null ? null : String(v).trim() || null);
  const optNum = (v) => (v === undefined ? undefined : v === null || v === '' ? null : Number(v));

  /* ---------- مساعدات عامة ---------- */

  const nowIso = () => new Date().toISOString();
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  }
  function tempPassword() {
    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 12; i += 1) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return out + '#7';
  }
  let H = null;
  const seq = (db, kind) => H.seq(db, kind);

  const findAccount = (db, id) => db.accounts.find((a) => a.id === Number(id)) || null;
  const findCategory = (db, id) => db.categories.find((c) => c.id === Number(id)) || null;
  const findUser = (db, id) => db.users.find((u) => u.id === Number(id)) || null;

  /* ---------- مين يشوف إيه (نفس access.js) ---------- */

  const isShared = (a) => a.owner_user_id === null || a.owner_user_id === undefined;
  const seesShared = (user) => can(user.role, 'accounts.read');
  const canSeeAccount = (user, a) => (isShared(a) ? seesShared(user) : a.owner_user_id === user.id);
  const canManageAccount = (user, a) => (isShared(a) ? can(user.role, 'accounts.manage') : a.owner_user_id === user.id && can(user.role, 'accounts.own'));
  const canRecordOn = (user, a) => (isShared(a) ? can(user.role, 'transactions.write') : a.owner_user_id === user.id);

  /* ---------- المستخدم والجلسة ---------- */

  function userCtx(db, u) {
    const h = db.households.find((x) => x.id === u.household_id);
    return Object.assign({}, u, {
      household_name: h.name, currency: h.currency, timezone: h.timezone, month_start_day: h.month_start_day, household_status: h.status,
    });
  }
  function publicUser(u) {
    return {
      id: u.id, uuid: u.uuid, full_name: u.full_name, email: u.email, phone: u.phone, role: u.role,
      must_change_password: Boolean(u.must_change_password),
      household: { id: u.household_id, name: u.household_name, currency: u.currency, timezone: u.timezone, month_start_day: u.month_start_day },
      permissions: (ROLE_PERMISSIONS[u.role] || []).slice(),
    };
  }
  function currentUser(db) {
    if (!db.session) return null;
    const u = db.users.find((x) => x.id === db.session.userId && !x.deleted_at && x.status === 'active');
    if (!u) return null;
    const ctx = userCtx(db, u);
    return ctx.household_status === 'active' ? ctx : null;
  }
  function sessionPayload(db, userId) {
    return {
      user: publicUser(userCtx(db, findUser(db, userId))),
      tokens: { access_token: 'demo.' + userId + '.' + H.code(24), token_type: 'Bearer', expires_in: 900 },
    };
  }
  function startSession(db, userId) {
    const u = findUser(db, userId);
    u.last_login_at = nowIso();
    u.failed_logins = 0;
    db.session = { userId, familyId: uuid(), started_at: nowIso() };
    return sessionPayload(db, userId);
  }

  /* ---------- سجل التغييرات ---------- */

  function audit(db, user, action, entity, entityId, before, after, at) {
    db.audit.push({
      id: seq(db, 'audit'), household_id: user.household_id, user_id: user.id, action, entity, entity_id: entityId === undefined ? null : entityId,
      before_json: before === undefined ? null : before, after_json: after === undefined ? null : after, created_at: at || nowIso(),
    });
  }

  /* ---------- الحسابات ---------- */

  function balances(db, householdId) {
    const map = new Map();
    db.accounts.forEach((a) => { if (a.household_id === householdId) map.set(a.id, a.opening_balance_minor); });
    db.transactions.forEach((t) => {
      if (t.household_id !== householdId) return;
      if (map.has(t.account_id)) map.set(t.account_id, map.get(t.account_id) + (t.type === 'income' ? t.amount_minor : -t.amount_minor));
      if (t.to_account_id && map.has(t.to_account_id)) map.set(t.to_account_id, map.get(t.to_account_id) + t.amount_minor);
    });
    return map;
  }
  function presentAccount(db, user, a, bal) {
    const owner = a.owner_user_id ? findUser(db, a.owner_user_id) : null;
    return {
      id: a.id, owner_user_id: a.owner_user_id, name: a.name, type: a.type, institution: a.institution,
      opening_balance_minor: a.opening_balance_minor, credit_limit_minor: a.credit_limit_minor, color: a.color,
      include_in_net_worth: Boolean(a.include_in_net_worth), sort_order: a.sort_order, archived_at: a.archived_at,
      created_at: a.created_at, updated_at: a.updated_at, owner_name: owner ? owner.full_name : null,
      balance_minor: bal.get(a.id) || 0, is_shared: isShared(a), can_manage: canManageAccount(user, a),
      can_record: canRecordOn(user, a) && !a.archived_at,
    };
  }
  function listAccounts(db, user, includeArchived) {
    const bal = balances(db, user.household_id);
    return db.accounts
      .filter((a) => a.household_id === user.household_id && canSeeAccount(user, a) && (includeArchived || !a.archived_at))
      .sort((a, b) => (a.archived_at ? 1 : 0) - (b.archived_at ? 1 : 0) || a.sort_order - b.sort_order || a.id - b.id)
      .map((a) => presentAccount(db, user, a, bal));
  }
  function visibleAccount(db, user, id) {
    const a = findAccount(db, id);
    if (!a || a.household_id !== user.household_id || !canSeeAccount(user, a)) throw notFound('الحساب غير موجود');
    return a;
  }
  const briefAccount = (p) => ({ id: p.id, name: p.name, type: p.type, is_shared: p.is_shared, opening_balance_minor: p.opening_balance_minor, archived_at: p.archived_at });

  function accountNameTaken(db, user, name, ownerId, exceptId) {
    return db.accounts.some((a) => a.household_id === user.household_id && a.id !== exceptId && !a.archived_at
      && (a.owner_user_id || null) === (ownerId || null) && a.name.trim() === name.trim());
  }
  function validateAccountFields(b, isCreate) {
    check({
      name: V.text(b.name, { required: isCreate || b.name !== undefined, max: 80 }),
      type: V.oneOf(b.type, ['cash', 'bank', 'wallet', 'card', 'savings', 'other'], { required: isCreate }),
      institution: V.text(b.institution, { max: 80 }),
      opening_balance_minor: V.money(b.opening_balance_minor, { min: -100000000000 }),
      credit_limit_minor: b.credit_limit_minor === null ? null : V.money(b.credit_limit_minor, { min: 0 }),
      color: V.color(b.color),
      include_in_net_worth: V.bool(b.include_in_net_worth),
      scope: isCreate ? V.oneOf(b.scope, ['shared', 'private']) : null,
      archived: isCreate ? null : V.bool(b.archived),
    });
  }

  /* ---------- التصنيفات ---------- */

  function sortCategories(db, list) {
    const parentOrder = (c) => (c.parent_id ? (findCategory(db, c.parent_id) || c).sort_order : c.sort_order);
    return list.slice().sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)
      || parentOrder(a) - parentOrder(b)
      || (a.parent_id || a.id) - (b.parent_id || b.id)
      || (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0)
      || a.sort_order - b.sort_order
      || a.name.localeCompare(b.name, 'ar'));
  }
  const presentCategory = (c) => ({ id: c.id, parent_id: c.parent_id, kind: c.kind, name: c.name, icon: c.icon, color: c.color, sort_order: c.sort_order, archived_at: c.archived_at, created_at: c.created_at });
  function ownCategory(db, user, id) {
    const c = findCategory(db, id);
    if (!c || c.household_id !== user.household_id) throw notFound('التصنيف غير موجود');
    return c;
  }
  const briefCategory = (c) => ({ id: c.id, kind: c.kind, name: c.name, parent_id: c.parent_id, archived_at: c.archived_at });
  function assertValidParent(db, user, parentId, kind, selfId) {
    if (selfId && Number(parentId) === selfId) throw fail(400, 'التصنيف مينفعش يكون أب لنفسه', 'BAD_PARENT', { parent_id: 'غير صالح' });
    const p = findCategory(db, parentId);
    const problem = !p || p.household_id !== user.household_id ? 'غير موجود'
      : p.kind !== kind ? 'نوعه مختلف'
        : p.parent_id !== null ? 'لازم يكون تصنيف رئيسي'
          : p.archived_at ? 'مؤرشف' : null;
    if (problem) throw fail(400, 'التصنيف الرئيسي ' + problem, 'BAD_PARENT', { parent_id: problem });
  }
  function categoryNameTaken(db, user, c, exceptId) {
    return db.categories.some((x) => x.household_id === user.household_id && x.id !== exceptId && x.kind === c.kind
      && (x.parent_id || null) === (c.parent_id || null) && x.name.trim() === c.name.trim());
  }
  function archiveCategory(db, id) {
    const ids = [id].concat(db.categories.filter((c) => c.parent_id === id).map((c) => c.id));
    const at = nowIso();
    db.categories.forEach((c) => { if (ids.indexOf(c.id) >= 0 && !c.archived_at) c.archived_at = at; });
    db.budgets = db.budgets.filter((b) => ids.indexOf(b.category_id) < 0);
  }

  /* ---------- العمليات ---------- */

  function txVisible(db, user, t) {
    if (t.household_id !== user.household_id) return false;
    const a = findAccount(db, t.account_id);
    const ta = t.to_account_id ? findAccount(db, t.to_account_id) : null;
    return canSeeAccount(user, a) || Boolean(ta && canSeeAccount(user, ta));
  }
  function presentTx(db, user, t) {
    const a = findAccount(db, t.account_id);
    const ta = t.to_account_id ? findAccount(db, t.to_account_id) : null;
    const c = t.category_id ? findCategory(db, t.category_id) : null;
    const pc = c && c.parent_id ? findCategory(db, c.parent_id) : null;
    const creator = t.created_by ? findUser(db, t.created_by) : null;
    const writable = (x) => canRecordOn(user, x) && !x.archived_at;
    const row = {
      id: t.id, type: t.type, account_id: t.account_id, to_account_id: t.to_account_id, category_id: t.category_id,
      amount_minor: t.amount_minor, occurred_on: t.occurred_on, payee: t.payee, note: t.note, created_by: t.created_by,
      created_at: t.created_at, updated_at: t.updated_at,
      account_name: a.name, account_color: a.color,
      to_account_name: ta ? ta.name : null, to_account_color: ta ? ta.color : null,
      category_name: c ? c.name : null, category_icon: c ? c.icon : null, category_color: c ? c.color : null,
      category_parent_id: c ? c.parent_id : null,
      parent_category_name: pc ? pc.name : null, parent_category_icon: pc ? pc.icon : null,
      created_by_name: creator ? creator.full_name : null,
      can_edit: writable(a) && (!ta || writable(ta)),
    };
    if (!canSeeAccount(user, a)) { row.account_name = PRIVATE_NAME; row.account_color = null; }
    if (ta && !canSeeAccount(user, ta)) { row.to_account_name = PRIVATE_NAME; row.to_account_color = null; }
    return row;
  }
  function filterTx(db, user, f) {
    f = f || {};
    const q = f.q ? String(f.q).trim().toLowerCase() : '';
    return db.transactions.filter((t) => {
      if (!txVisible(db, user, t)) return false;
      if (f.from && t.occurred_on < f.from) return false;
      if (f.to && t.occurred_on > f.to) return false;
      if (f.type && t.type !== f.type) return false;
      if (f.account_id && t.account_id !== Number(f.account_id) && t.to_account_id !== Number(f.account_id)) return false;
      if (f.category_id) {
        const c = t.category_id ? findCategory(db, t.category_id) : null;
        if (!c || (c.id !== Number(f.category_id) && c.parent_id !== Number(f.category_id))) return false;
      }
      if (f.created_by && t.created_by !== Number(f.created_by)) return false;
      if (q && (t.payee || '').toLowerCase().indexOf(q) < 0 && (t.note || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function visibleTx(db, user, id) {
    const t = db.transactions.find((x) => x.id === Number(id));
    if (!t || !txVisible(db, user, t)) throw notFound('العملية غير موجودة');
    return t;
  }
  function assertRecordable(db, user, accountId, field) {
    const a = findAccount(db, accountId);
    if (!a || a.household_id !== user.household_id || !canSeeAccount(user, a)) throw fieldError(field, 'الحساب غير موجود');
    if (a.archived_at) throw conflict('الحساب ده مؤرشف — رجّعه الأول لو عايز تسجّل عليه', 'ACCOUNT_ARCHIVED', { [field]: 'مؤرشف' });
    if (!canRecordOn(user, a)) throw fail(403, 'مينفعش تسجّل على الحساب ده', 'FORBIDDEN', { [field]: 'غير مسموح' });
    return a;
  }
  function resolveShape(db, user, data, current) {
    assertRecordable(db, user, data.account_id, 'account_id');
    if (data.type === 'transfer') {
      if (!data.to_account_id) throw fieldError('to_account_id', 'اختار الحساب اللي هتحوّل له');
      if (Number(data.to_account_id) === Number(data.account_id)) throw fieldError('to_account_id', 'مينفعش تحوّل لنفس الحساب');
      assertRecordable(db, user, data.to_account_id, 'to_account_id');
      return Object.assign({}, data, { category_id: null });
    }
    if (!data.category_id) throw fieldError('category_id', 'اختار التصنيف');
    const c = findCategory(db, data.category_id);
    if (!c || c.household_id !== user.household_id) throw fieldError('category_id', 'التصنيف غير موجود');
    if (c.kind !== data.type) throw fieldError('category_id', data.type === 'expense' ? 'التصنيف ده للدخل مش للمصروف' : 'التصنيف ده للمصروف مش للدخل');
    if (c.archived_at && (!current || current.category_id !== c.id)) throw fieldError('category_id', 'التصنيف ده مؤرشف');
    return Object.assign({}, data, { to_account_id: null });
  }
  const TX_FIELDS = ['type', 'account_id', 'to_account_id', 'category_id', 'amount_minor', 'occurred_on', 'payee', 'note'];
  function normalizeTx(d) {
    return {
      type: d.type, account_id: Number(d.account_id), to_account_id: d.to_account_id ? Number(d.to_account_id) : null,
      category_id: d.category_id ? Number(d.category_id) : null, amount_minor: d.amount_minor, occurred_on: d.occurred_on,
      payee: optText(d.payee) || null, note: optText(d.note) || null,
    };
  }
  function validateTx(b, isCreate) {
    check({
      type: V.oneOf(b.type, ['expense', 'income', 'transfer'], { required: isCreate }),
      account_id: V.id(b.account_id, { required: isCreate }),
      to_account_id: V.id(b.to_account_id),
      category_id: V.id(b.category_id),
      amount_minor: V.money(b.amount_minor, { required: isCreate }),
      occurred_on: V.date(b.occurred_on, { required: isCreate }),
      payee: V.text(b.payee, { max: 120 }),
      note: V.text(b.note, { max: 500 }),
    });
  }
  /** إنشاء عملية بقواعد السيرفر كلها — مشترك بين «سجّل» و«دفعت» والتلقائي */
  function createTx(db, user, input, createdBy, at) {
    const data = normalizeTx(resolveShape(db, user, normalizeTx(input), null));
    const stamp = at || nowIso();
    const t = Object.assign({ id: seq(db, 'tx'), household_id: user.household_id }, data, {
      created_by: createdBy === undefined ? user.id : createdBy, created_at: stamp, updated_at: stamp,
    });
    db.transactions.push(t);
    return t;
  }
  const briefTx = (t) => ({ id: t.id, type: t.type, account_id: t.account_id, to_account_id: t.to_account_id, category_id: t.category_id, amount_minor: t.amount_minor, occurred_on: t.occurred_on });
  /** حذف عملية: زي ON DELETE في القاعدة — المعاد يرجع مستحقًّا والقسط يرجع غير مدفوع */
  function deleteTx(db, id) {
    db.transactions = db.transactions.filter((t) => t.id !== id);
    db.postings = db.postings.filter((p) => p.transaction_id !== id);
    db.items.forEach((i) => { if (i.transaction_id === id) i.transaction_id = null; });
  }

  /* ---------- الميزانيات ---------- */

  function resolvePeriod(user, month) {
    const today = todayIn(user.timezone);
    const period = periodRange(month || periodOf(today, user.month_start_day), user.month_start_day);
    const days = diffDays(period.from, period.to) + 1;
    let elapsed = days;
    if (today < period.from) elapsed = 0;
    else if (today <= period.to) elapsed = diffDays(period.from, today) + 1;
    return Object.assign({}, period, { days, elapsed_days: elapsed, is_current: today >= period.from && today <= period.to });
  }
  function budgetStatus(spent, amount, alertBps) {
    const used = ratioBps(spent, amount);
    if (used > 10000) return 'over';
    if (used >= alertBps) return 'warning';
    return 'ok';
  }
  function spentOn(db, user, categoryId, from, to) {
    return sum(db.transactions.filter((t) => {
      if (t.household_id !== user.household_id || t.type !== 'expense' || t.occurred_on < from || t.occurred_on > to) return false;
      const c = findCategory(db, t.category_id);
      if (!c || (c.id !== categoryId && c.parent_id !== categoryId)) return false;
      return canSeeAccount(user, findAccount(db, t.account_id));
    }).map((t) => t.amount_minor));
  }
  const briefBudget = (b) => ({ id: b.id, category_id: b.category_id, amount_minor: b.amount_minor, alert_bps: b.alert_bps });
  function ownBudget(db, user, id) {
    const b = db.budgets.find((x) => x.id === Number(id) && x.household_id === user.household_id);
    if (!b) throw notFound('الميزانية غير موجودة');
    return b;
  }

  /* ---------- التقارير ---------- */

  function flows(db, user, from, to) {
    return db.transactions.filter((t) => t.household_id === user.household_id && (t.type === 'income' || t.type === 'expense')
      && t.occurred_on >= from && t.occurred_on <= to && canSeeAccount(user, findAccount(db, t.account_id)));
  }
  function totalsBetween(db, user, from, to) {
    const list = flows(db, user, from, to);
    const income = sum(list.filter((t) => t.type === 'income').map((t) => t.amount_minor));
    const expense = sum(list.filter((t) => t.type === 'expense').map((t) => t.amount_minor));
    return { income_minor: income, expense_minor: expense, net_minor: income - expense };
  }
  function byCategory(db, user, from, to) {
    const groups = { expense: new Map(), income: new Map() };
    flows(db, user, from, to).forEach((t) => {
      const c = findCategory(db, t.category_id);
      if (!c) return;
      const root = c.parent_id || c.id;
      const g = groups[t.type].get(root) || { amount_minor: 0, count: 0 };
      g.amount_minor += t.amount_minor;
      g.count += 1;
      groups[t.type].set(root, g);
    });
    const shape = (type) => {
      const items = [];
      groups[type].forEach((g, id) => {
        const c = findCategory(db, id);
        items.push({ name: c.name, icon: c.icon, color: c.color, category_id: id, amount_minor: g.amount_minor, count: g.count });
      });
      items.sort((a, b) => b.amount_minor - a.amount_minor);
      const total = sum(items.map((i) => i.amount_minor));
      return items.map((i) => Object.assign(i, { share_bps: ratioBps(i.amount_minor, total) }));
    };
    return { expense: shape('expense'), income: shape('income') };
  }

  /* ---------- الفواتير المتكرّرة ---------- */

  function postingsOf(db, ruleId) {
    const map = new Map();
    db.postings.filter((p) => p.rule_id === ruleId).forEach((p) => map.set(p.due_on, p));
    return map;
  }
  function ruleVisible(db, user, r) {
    if (r.household_id !== user.household_id) return false;
    const a = findAccount(db, r.account_id);
    const ta = r.to_account_id ? findAccount(db, r.to_account_id) : null;
    return canSeeAccount(user, a) && (!ta || canSeeAccount(user, ta));
  }
  function presentRule(db, user, r) {
    const a = findAccount(db, r.account_id);
    const ta = r.to_account_id ? findAccount(db, r.to_account_id) : null;
    const c = r.category_id ? findCategory(db, r.category_id) : null;
    const pc = c && c.parent_id ? findCategory(db, c.parent_id) : null;
    const creator = r.created_by ? findUser(db, r.created_by) : null;
    const postings = postingsOf(db, r.id);
    const handled = new Set(postings.keys());
    const next = nextPending(r, handled);
    const keys = Array.from(postings.keys()).sort();
    let problem = null;
    if (a.archived_at || (ta && ta.archived_at)) problem = 'account_archived';
    else if (c && c.archived_at) problem = 'category_archived';
    return {
      id: r.id, name: r.name, type: r.type, account_id: r.account_id, to_account_id: r.to_account_id, category_id: r.category_id,
      amount_minor: r.amount_minor, payee: r.payee, note: r.note, frequency: r.frequency, interval_count: r.interval_count,
      start_on: r.start_on, end_on: r.end_on, total_count: r.total_count, auto_post: Boolean(r.auto_post),
      created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at,
      account_name: a.name, account_color: a.color, to_account_name: ta ? ta.name : null, to_account_color: ta ? ta.color : null,
      category_name: c ? c.name : null, category_icon: c ? c.icon : null, category_color: c ? c.color : null,
      parent_category_name: pc ? pc.name : null, parent_category_icon: pc ? pc.icon : null,
      created_by_name: creator ? creator.full_name : null,
      next_due_on: next ? next.due_on : null,
      remaining_count: remainingCount(r, handled),
      last_handled_on: keys.length ? keys[keys.length - 1] : null,
      problem,
      can_edit: canRecordOn(user, a) && (!ta || canRecordOn(user, ta)),
    };
  }
  function visibleRule(db, user, id) {
    const r = db.rules.find((x) => x.id === Number(id));
    if (!r || !ruleVisible(db, user, r)) throw notFound('الفاتورة المتكرّرة غير موجودة');
    return r;
  }
  function listRules(db, user) {
    return db.rules.filter((r) => ruleVisible(db, user, r))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar') || a.id - b.id)
      .map((r) => presentRule(db, user, r))
      .sort((a, b) => (a.next_due_on || '9999').localeCompare(b.next_due_on || '9999'));
  }
  const briefRule = (r) => ({
    id: r.id, name: r.name, type: r.type, account_id: r.account_id, to_account_id: r.to_account_id, category_id: r.category_id,
    amount_minor: r.amount_minor, frequency: r.frequency, interval_count: r.interval_count, start_on: r.start_on,
    end_on: r.end_on, total_count: r.total_count, auto_post: Boolean(r.auto_post),
  });
  const RULE_FIELDS = ['name', 'type', 'account_id', 'to_account_id', 'category_id', 'amount_minor', 'payee', 'note',
    'frequency', 'interval_count', 'start_on', 'end_on', 'total_count', 'auto_post'];
  function validateRule(b, isCreate) {
    check({
      name: V.text(b.name, { required: isCreate || b.name !== undefined, max: 80 }),
      type: V.oneOf(b.type, ['expense', 'income', 'transfer'], { required: isCreate }),
      account_id: V.id(b.account_id, { required: isCreate }),
      to_account_id: V.id(b.to_account_id),
      category_id: V.id(b.category_id),
      amount_minor: V.money(b.amount_minor, { required: isCreate }),
      payee: V.text(b.payee, { max: 120 }),
      note: V.text(b.note, { max: 500 }),
      frequency: V.oneOf(b.frequency, ['weekly', 'monthly', 'yearly'], { required: isCreate }),
      interval_count: V.int(b.interval_count, { min: 1, max: 52, minMessage: 'أقل حاجة 1', maxMessage: 'أقصى حاجة 52' }),
      start_on: V.date(b.start_on, { required: isCreate }),
      end_on: V.date(b.end_on),
      total_count: V.int(b.total_count, { min: 1, max: 1000, minMessage: 'مرة واحدة على الأقل', maxMessage: 'أقصى حاجة 1000 مرة' }),
      auto_post: V.bool(b.auto_post),
    });
  }
  function resolveRule(db, user, data) {
    const shaped = resolveShape(db, user, {
      type: data.type, account_id: data.account_id, to_account_id: data.to_account_id || null,
      category_id: data.category_id || null, amount_minor: data.amount_minor, occurred_on: todayIn(user.timezone),
    }, null);
    if (data.end_on && data.start_on && data.end_on < data.start_on) throw fieldError('end_on', 'تاريخ النهاية قبل أول معاد');
    return Object.assign({}, data, {
      account_id: Number(data.account_id),
      to_account_id: shaped.to_account_id ? Number(shaped.to_account_id) : null,
      category_id: shaped.category_id ? Number(shaped.category_id) : null,
      payee: optText(data.payee) || null, note: optText(data.note) || null,
      interval_count: data.interval_count || 1, end_on: data.end_on || null,
      total_count: data.total_count === undefined ? null : data.total_count, auto_post: Boolean(data.auto_post),
    });
  }
  /** تسجيل معاد واحد كعملية: { transaction, already_posted } */
  function postOccurrence(db, user, rule, dueOn, overrides, createdBy, at) {
    overrides = overrides || {};
    const existing = db.postings.find((p) => p.rule_id === rule.id && p.due_on === dueOn);
    if (existing && existing.status === 'skipped') throw conflict('المعاد ده اتخطّى قبل كده', 'ALREADY_SKIPPED');
    if (existing) {
      const t = existing.transaction_id ? db.transactions.find((x) => x.id === existing.transaction_id) : null;
      return { transaction: t && txVisible(db, user, t) ? presentTx(db, user, t) : null, already_posted: true };
    }
    const t = createTx(db, user, {
      type: rule.type,
      account_id: overrides.account_id || rule.account_id,
      to_account_id: rule.to_account_id,
      category_id: rule.category_id,
      amount_minor: overrides.amount_minor || rule.amount_minor,
      occurred_on: overrides.occurred_on || todayIn(user.timezone),
      payee: rule.payee || rule.name,
      note: overrides.note !== undefined ? overrides.note : rule.note,
    }, undefined, at);
    db.postings.push({
      id: seq(db, 'posting'), rule_id: rule.id, due_on: dueOn, status: 'posted', transaction_id: t.id,
      created_by: createdBy === undefined ? user.id : createdBy, created_at: at || nowIso(),
    });
    return { transaction: presentTx(db, user, t), already_posted: false };
  }
  function ruleDueItems(db, user, range) {
    const items = [];
    const rules = listRules(db, user);
    rules.forEach((rule) => {
      if (!rule.next_due_on || rule.next_due_on > range.to) return;
      const handled = postingsOf(db, rule.id);
      const start = range.from && range.from > rule.next_due_on ? range.from : rule.next_due_on;
      occurrencesBetween(rule, { from: start, to: range.to }).filter((o) => !handled.has(o.due_on)).slice(0, 60).forEach((o) => {
        items.push({
          key: 'recurring:' + rule.id + ':' + o.due_on, source: 'recurring', source_id: rule.id, item_id: null, due_on: o.due_on,
          name: rule.name, type: rule.type, amount_minor: rule.amount_minor, payee: rule.payee,
          account_id: rule.account_id, account_name: rule.account_name, to_account_id: rule.to_account_id, to_account_name: rule.to_account_name,
          category_id: rule.category_id, category_name: rule.category_name,
          category_icon: rule.category_icon || rule.parent_category_icon, category_color: rule.category_color,
          frequency: rule.frequency, interval_count: rule.interval_count, auto_post: rule.auto_post, installment: null,
          problem: rule.problem, can_post: rule.can_edit && !rule.problem,
          status: o.due_on < range.today ? 'overdue' : o.due_on === range.today ? 'today' : 'upcoming',
        });
      });
    });
    return { items, active: rules.filter((r) => r.next_due_on).length };
  }
  /** التسجيل التلقائي (زي مهمة السيرفر): كل معاد تلقائي فات يتسجّل بتاريخه باسم منشئ القاعدة */
  function postDueAuto(db) {
    db.rules.filter((r) => r.auto_post).forEach((rule) => {
      const h = db.households.find((x) => x.id === rule.household_id);
      if (!h || h.status !== 'active') return;
      const today = todayIn(h.timezone);
      if (rule.start_on > today) return;
      const handled = postingsOf(db, rule.id);
      const pending = occurrencesBetween(rule, { to: today }).filter((o) => !handled.has(o.due_on));
      if (!pending.length) return;
      const creator = rule.created_by ? findUser(db, rule.created_by) : null;
      if (!creator || creator.status !== 'active' || creator.deleted_at) return;
      const actor = userCtx(db, creator);
      for (let i = 0; i < pending.length; i += 1) {
        try {
          const res = postOccurrence(db, actor, rule, pending[i].due_on, { occurred_on: pending[i].due_on }, null);
          if (res.already_posted) continue;
          audit(db, actor, 'transaction.create', 'transaction', res.transaction.id, undefined, briefTx(res.transaction));
          audit(db, actor, 'recurring.post', 'recurring_rule', rule.id, undefined, { name: rule.name, due_on: pending[i].due_on, transaction_id: res.transaction.id, amount_minor: res.transaction.amount_minor, auto: true });
        } catch (e) {
          break; // حساب اتأرشف أو صلاحية اتشالت: تفضل تذكيرًا
        }
      }
    });
  }

  /* ---------- التقسيط ---------- */

  function buildSchedule(d) {
    const down = d.down_payment_minor || 0;
    const items = down > 0 ? [{ seq: 0, due_on: d.purchase_on, amount_minor: down }] : [];
    const rest = d.total_minor - down;
    const base = Math.floor(rest / d.installment_count);
    const monthly = { frequency: 'monthly', interval_count: 1, start_on: d.first_due_on };
    for (let s = 1; s <= d.installment_count; s += 1) {
      items.push({ seq: s, due_on: occurrenceAt(monthly, s - 1), amount_minor: s === d.installment_count ? rest - base * (d.installment_count - 1) : base });
    }
    return items;
  }
  function insertItems(db, planId, items) {
    items.forEach((i) => db.items.push({ id: seq(db, 'item'), plan_id: planId, seq: i.seq, due_on: i.due_on, amount_minor: i.amount_minor, transaction_id: null, settled_at: null, settled_by: null }));
  }
  const itemStatus = (dueOn, today) => (dueOn < today ? 'overdue' : dueOn === today ? 'today' : 'upcoming');
  function presentPlan(db, user, p) {
    const today = todayIn(user.timezone);
    const a = findAccount(db, p.account_id);
    const c = p.category_id ? findCategory(db, p.category_id) : null;
    const pc = c && c.parent_id ? findCategory(db, c.parent_id) : null;
    const creator = p.created_by ? findUser(db, p.created_by) : null;
    const items = db.items.filter((i) => i.plan_id === p.id).sort((x, y) => x.seq - y.seq).map((i) => {
      const t = i.transaction_id ? db.transactions.find((x) => x.id === i.transaction_id) : null;
      const visible = Boolean(t) && canSeeAccount(user, findAccount(db, t.account_id));
      let status = itemStatus(i.due_on, today);
      if (i.transaction_id) status = 'paid';
      else if (i.settled_at) status = 'settled';
      return {
        id: i.id, seq: i.seq, due_on: i.due_on, amount_minor: i.amount_minor, paid: Boolean(i.transaction_id || i.settled_at),
        transaction_id: visible ? i.transaction_id : null, paid_on: visible ? t.occurred_on : null, settled_at: i.settled_at, status,
      };
    });
    const total = sum(items.map((i) => i.amount_minor));
    const paid = sum(items.filter((i) => i.paid).map((i) => i.amount_minor));
    const next = items.find((i) => !i.paid) || null;
    let problem = null;
    if (a.archived_at) problem = 'account_archived';
    else if (c && c.archived_at) problem = 'category_archived';
    const plan = {
      id: p.id, name: p.name, account_id: p.account_id, category_id: p.category_id, payee: p.payee, note: p.note,
      total_minor: total, down_payment_minor: p.down_payment_minor, installment_count: p.installment_count,
      purchase_on: p.purchase_on, first_due_on: p.first_due_on, created_by: p.created_by, created_at: p.created_at, updated_at: p.updated_at,
      account_name: a.name, account_color: a.color,
      category_name: c ? c.name : null, category_icon: c ? c.icon : null, category_color: c ? c.color : null,
      parent_category_name: pc ? pc.name : null, parent_category_icon: pc ? pc.icon : null,
      created_by_name: creator ? creator.full_name : null,
      paid_minor: paid, remaining_minor: total - paid, paid_bps: ratioBps(paid, total),
      installments_paid: items.filter((i) => i.seq > 0 && i.paid).length,
      overdue_count: items.filter((i) => i.status === 'overdue').length,
      next_item: next && { id: next.id, seq: next.seq, due_on: next.due_on, amount_minor: next.amount_minor, status: next.status },
      done: total > 0 && paid === total, problem, can_edit: canRecordOn(user, a),
    };
    return { plan, items };
  }
  const planVisible = (db, user, p) => p.household_id === user.household_id && canSeeAccount(user, findAccount(db, p.account_id));
  function visiblePlan(db, user, id) {
    const p = db.plans.find((x) => x.id === Number(id));
    if (!p || !planVisible(db, user, p)) throw notFound('خطّة التقسيط غير موجودة');
    return p;
  }
  function fullPlan(db, user, p) {
    const r = presentPlan(db, user, p);
    return Object.assign({}, r.plan, { items: r.items });
  }
  const briefPlan = (p) => ({ id: p.id, name: p.name, account_id: p.account_id, category_id: p.category_id, total_minor: p.total_minor, down_payment_minor: p.down_payment_minor, installment_count: p.installment_count, purchase_on: p.purchase_on, first_due_on: p.first_due_on });
  const SCHEDULE_FIELDS = ['total_minor', 'down_payment_minor', 'installment_count', 'purchase_on', 'first_due_on'];
  const PLAN_FIELDS = ['name', 'account_id', 'category_id', 'payee', 'note'].concat(SCHEDULE_FIELDS);
  function scheduleProblem(d) {
    if (d.down_payment_minor >= d.total_minor) return { down_payment_minor: 'المقدّم لازم أقل من الإجمالي' };
    if (d.total_minor - d.down_payment_minor < d.installment_count) return { installment_count: 'الأقساط أكتر من المبلغ الباقي' };
    if (d.purchase_on > d.first_due_on) return { first_due_on: 'أول قسط قبل يوم الشراء' };
    return null;
  }
  function validatePlan(b, isCreate) {
    check({
      name: V.text(b.name, { required: isCreate || b.name !== undefined, max: 80 }),
      account_id: V.id(b.account_id, { required: isCreate }),
      category_id: V.id(b.category_id, { required: isCreate }),
      payee: V.text(b.payee, { max: 120 }),
      note: V.text(b.note, { max: 500 }),
      total_minor: V.money(b.total_minor, { required: isCreate }),
      down_payment_minor: V.money(b.down_payment_minor, { min: 0 }),
      installment_count: V.int(b.installment_count, { required: isCreate, min: 1, max: 120, minMessage: 'قسط واحد على الأقل', maxMessage: 'أقصى حاجة 120 قسط' }),
      purchase_on: V.date(b.purchase_on),
      first_due_on: V.date(b.first_due_on, { required: isCreate }),
    });
  }
  function assertPlanTemplate(db, user, d) {
    resolveShape(db, user, { type: 'expense', account_id: d.account_id, category_id: d.category_id, amount_minor: 1, occurred_on: todayIn(user.timezone) }, null);
  }
  function planDueItems(db, user, range) {
    const items = [];
    const active = new Set();
    db.plans.filter((p) => planVisible(db, user, p)).forEach((p) => {
      const a = findAccount(db, p.account_id);
      const c = findCategory(db, p.category_id);
      const pc = c && c.parent_id ? findCategory(db, c.parent_id) : null;
      const problem = a.archived_at ? 'account_archived' : c && c.archived_at ? 'category_archived' : null;
      db.items.filter((i) => i.plan_id === p.id && !i.transaction_id && !i.settled_at).forEach((i) => {
        active.add(p.id);
        if (i.due_on > range.to || (range.from && i.due_on < range.from)) return;
        items.push({
          key: 'installment:' + p.id + ':' + i.id, source: 'installment', source_id: p.id, item_id: i.id, due_on: i.due_on,
          name: p.name, type: 'expense', amount_minor: i.amount_minor, payee: p.payee,
          account_id: p.account_id, account_name: a.name, to_account_id: null, to_account_name: null,
          category_id: p.category_id, category_name: c ? c.name : null, category_icon: (c && c.icon) || (pc && pc.icon) || null,
          category_color: c ? c.color : null, frequency: 'monthly', interval_count: 1, auto_post: false,
          installment: { seq: i.seq, count: p.installment_count }, problem,
          can_post: canRecordOn(user, a) && !problem, status: itemStatus(i.due_on, range.today),
        });
      });
    });
    items.sort((x, y) => x.due_on.localeCompare(y.due_on) || x.source_id - y.source_id);
    return { items, active: active.size };
  }

  /* ---------- الأفراد ---------- */

  const ROLE_ORDER = { owner: 0, admin: 1, member: 2, child: 3, viewer: 4 };
  function presentMember(actor, u) {
    const base = { id: u.id, full_name: u.full_name, role: u.role, status: u.status };
    if (!can(actor.role, 'household.manage')) return base;
    return Object.assign(base, { email: u.email, phone: u.phone, must_change_password: Boolean(u.must_change_password), last_login_at: u.last_login_at, created_at: u.created_at });
  }
  const fullMember = (u) => ({ id: u.id, full_name: u.full_name, role: u.role, status: u.status, email: u.email, phone: u.phone, must_change_password: Boolean(u.must_change_password), last_login_at: u.last_login_at, created_at: u.created_at });
  const briefMember = (u) => ({ id: u.id, full_name: u.full_name, email: u.email, role: u.role, status: u.status });
  function memberOf(db, actor, id) {
    const u = findUser(db, id);
    if (!u || u.household_id !== actor.household_id || u.deleted_at) throw notFound('الفرد غير موجود');
    return u;
  }
  const activeOwners = (db, householdId, exceptId) => db.users.filter((u) => u.household_id === householdId && u.role === 'owner' && u.status === 'active' && !u.deleted_at && u.id !== exceptId).length;
  const emailUsed = (db, email) => db.users.some((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());

  function presentHousehold(db, h) {
    return {
      id: h.id, uuid: h.uuid, name: h.name, currency: h.currency, timezone: h.timezone, month_start_day: h.month_start_day, created_at: h.created_at,
      members_count: db.users.filter((u) => u.household_id === h.id && !u.deleted_at).length,
    };
  }

  /* ---------- التصنيفات المقترحة لأي أسرة جديدة (config/defaultCategories.js) ---------- */

  const DEFAULT_CATEGORIES = {
    expense: [
      { name: 'أكل وشرب', icon: '🛒', color: '#c2410c', children: ['سوبرماركت', 'خضار وفاكهة', 'مطاعم وكافيهات', 'دليفري'] },
      { name: 'البيت', icon: '🏠', color: '#0f766e', children: ['إيجار', 'كهرباء', 'مياه', 'غاز', 'صيانة وتصليحات', 'مساعدة في البيت'] },
      { name: 'اتصالات وإنترنت', icon: '📱', color: '#4338ca', children: ['رصيد وباقات', 'إنترنت البيت'] },
      { name: 'مواصلات', icon: '🚗', color: '#1d4ed8', children: ['بنزين', 'أوبر وتاكسي', 'مواصلات عامة', 'صيانة العربية'] },
      { name: 'صحة', icon: '💊', color: '#be123c', children: ['كشف ودكتور', 'أدوية', 'تحاليل وأشعة'] },
      { name: 'تعليم', icon: '📚', color: '#7c3aed', children: ['مصاريف مدارس', 'دروس خصوصية', 'كتب وأدوات'] },
      { name: 'لبس', icon: '👕', color: '#a21caf' },
      { name: 'ترفيه وخروجات', icon: '🎉', color: '#db2777' },
      { name: 'هدايا ومناسبات', icon: '🎁', color: '#b45309' },
      { name: 'صدقات وزكاة', icon: '🤲', color: '#15803d' },
      { name: 'مصروف الأولاد', icon: '🧒', color: '#0369a1' },
      { name: 'أقساط وديون', icon: '💳', color: '#475569' },
      { name: 'مصاريف أخرى', icon: '📦', color: '#57534e' },
    ],
    income: [
      { name: 'مرتب', icon: '💼', color: '#047857' },
      { name: 'شغل حر', icon: '💻', color: '#0e7490' },
      { name: 'إيجار عقار', icon: '🏢', color: '#4d7c0f' },
      { name: 'أرباح وفوايد', icon: '📈', color: '#15803d' },
      { name: 'هدايا وعيديات', icon: '🎁', color: '#b45309' },
      { name: 'دخل آخر', icon: '💰', color: '#57534e' },
    ],
  };
  function seedDefaultCategories(db, householdId, at) {
    ['expense', 'income'].forEach((kind) => {
      DEFAULT_CATEGORIES[kind].forEach((cat, i) => {
        const parent = { id: seq(db, 'category'), household_id: householdId, parent_id: null, kind, name: cat.name, icon: cat.icon, color: cat.color, sort_order: (i + 1) * 10, archived_at: null, created_at: at };
        db.categories.push(parent);
        (cat.children || []).forEach((child, j) => {
          db.categories.push({ id: seq(db, 'category'), household_id: householdId, parent_id: parent.id, kind, name: child, icon: null, color: cat.color, sort_order: (j + 1) * 10, archived_at: null, created_at: at });
        });
      });
    });
  }

  /* ---------- بيانات البداية: بيت عائلة منصور ---------- */

  function seed(db, h) {
    H = h;
    const T = todayIn(TZ);
    const nowMs = Date.now();
    ['households', 'users', 'accounts', 'categories', 'transactions', 'budgets', 'rules', 'postings', 'plans', 'items', 'audit'].forEach((k) => { db[k] = []; });
    db.session = null;

    const START_DAY = 25; // الشهر المالي من يوم القبض
    const W = periodRange(addMonths(periodOf(T, START_DAY), -5), START_DAY).from; // أول يوم في البيانات
    const pad = (n) => String(n).padStart(2, '0');
    const hash = (k) => H.hash(k);
    // لحظة داخل اليوم (UTC) — والنهارده لحظة فاتت فعلًا
    const stamp = (day, key) => {
      const x = hash(day + (key || ''));
      if (day >= T) return new Date(nowMs - (20 + (x % 200)) * 60000).toISOString();
      return day + 'T' + pad(6 + (x % 12)) + ':' + pad(x % 60) + ':' + pad((x * 7) % 60) + '.000Z';
    };
    const between = (min, max, key) => (min + (hash(key) % (Math.floor((max - min) / 5) + 1)) * 5) * 100; // جنيه مقرّب لـ 5 ← قروش
    // يوم آمن للتكرار الشهري (لحدّ 28 عشان المعاد يقع نفس اليوم كل شهر)
    const safeDay = (iso) => (dayNumber(iso) > 28 ? monthOf(iso) + '-28' : iso);
    const monthsShift = (iso, k) => clampedDay(addMonths(monthOf(iso), k), dayNumber(iso));
    const firstOn = (day) => { const d = dayOf(monthOf(W), day); return d >= W ? d : dayOf(addMonths(monthOf(W), 1), day); };

    const createdAt = stamp(addDays(W, -3), 'hh');
    const HH = { id: seq(db, 'household'), uuid: uuid(), name: 'بيت عائلة منصور', currency: 'EGP', timezone: TZ, month_start_day: START_DAY, status: 'active', created_at: createdAt };
    db.households.push(HH);

    const person = (full_name, email, phone, role, at) => {
      const u = { id: seq(db, 'user'), uuid: uuid(), household_id: HH.id, full_name, email, phone, role, status: 'active', must_change_password: 0, password: DEMO_PASSWORD, failed_logins: 0, last_login_at: stamp(addDays(T, -(hash(email) % 3)), email), created_at: at, deleted_at: null };
      db.users.push(u);
      return u;
    };
    const ahmed = person('أحمد منصور', 'ahmed@masrofy.demo', '+201001234501', 'owner', createdAt);
    const mona = person('منى عادل', 'mona@masrofy.demo', '+201001234502', 'admin', stamp(addDays(W, -3), 'm'));
    const salma = person('سلمى أحمد', 'salma@masrofy.demo', '+201001234503', 'member', stamp(addDays(W, -2), 's'));
    const youssef = person('يوسف أحمد', 'youssef@masrofy.demo', null, 'child', stamp(addDays(W, -2), 'y'));
    const ctx = (u) => userCtx(db, u);
    const A = ctx(ahmed);
    const M = ctx(mona);
    const S = ctx(salma);
    const Y = ctx(youssef);

    seedDefaultCategories(db, HH.id, createdAt);
    const cat = (name) => db.categories.find((c) => c.name === name && c.household_id === HH.id).id;

    const account = (o, by) => {
      const a = Object.assign({ id: seq(db, 'account'), household_id: HH.id, owner_user_id: null, institution: null, credit_limit_minor: null, include_in_net_worth: 1, sort_order: 0, archived_at: null, created_by: by.id, created_at: stamp(addDays(W, -2), o.name), updated_at: stamp(addDays(W, -2), o.name) }, o);
      db.accounts.push(a);
      return a;
    };
    const CASH = account({ name: 'كاش البيت', type: 'cash', opening_balance_minor: 300000, color: '#0d6b57', sort_order: 1 }, ahmed);
    const BANK = account({ name: 'حساب المرتبات', type: 'bank', institution: 'البنك الأهلي', opening_balance_minor: 4200000, color: '#1d4ed8', sort_order: 2 }, ahmed);
    const WALLET = account({ name: 'محفظة الموبايل', type: 'wallet', institution: 'فودافون كاش', opening_balance_minor: 80000, color: '#be123c', sort_order: 3 }, mona);
    const CARD = account({ name: 'الكارت الائتماني', type: 'card', institution: 'البنك الأهلي', opening_balance_minor: 0, credit_limit_minor: 3000000, color: '#475569', sort_order: 4 }, ahmed);
    const SAVINGS = account({ name: 'شهادة الادخار', type: 'savings', institution: 'بنك مصر', opening_balance_minor: 10000000, color: '#b45309', sort_order: 5 }, ahmed);
    const P_AHMED = account({ name: 'جيبي', type: 'cash', owner_user_id: ahmed.id, opening_balance_minor: 150000, color: '#0f766e', sort_order: 10 }, ahmed);
    const P_MONA = account({ name: 'محفظتي', type: 'wallet', owner_user_id: mona.id, opening_balance_minor: 200000, color: '#a21caf', sort_order: 10 }, mona);
    const P_SALMA = account({ name: 'مصروفي', type: 'wallet', owner_user_id: salma.id, opening_balance_minor: 60000, color: '#7c3aed', sort_order: 10 }, salma);
    const P_YOUSSEF = account({ name: 'الحصّالة', type: 'cash', owner_user_id: youssef.id, opening_balance_minor: 25000, color: '#0369a1', sort_order: 10 }, youssef);

    // عملية مباشرة (البيانات صحيحة من الأول، فمن غير فحص)
    const tx = (o) => {
      const at = stamp(o.occurred_on, o.payee || o.note || o.type);
      const t = Object.assign({ id: seq(db, 'tx'), household_id: HH.id, to_account_id: null, category_id: null, payee: null, note: null, created_at: at, updated_at: at }, o);
      db.transactions.push(t);
      return t;
    };
    const sharedBy = (key) => (hash(key + 'by') % 2 ? ahmed.id : mona.id);

    /* المصاريف والدخل اليومي */
    let schoolDone = 0;
    eachDay(W, T).forEach((d) => {
      const wd = weekday(d);
      const dn = dayNumber(d);
      if (wd === 5) tx({ type: 'expense', account_id: CARD.id, category_id: cat('سوبرماركت'), amount_minor: between(1100, 1900, d + 'sm'), occurred_on: d, payee: hash(d) % 2 ? 'هايبر ماركت المعادي' : 'سوبرماركت الحي', created_by: sharedBy(d + 'sm') });
      if (wd === 2 || wd === 6) tx({ type: 'expense', account_id: CASH.id, category_id: cat('خضار وفاكهة'), amount_minor: between(180, 420, d + 'veg'), occurred_on: d, payee: 'سوق الخضار', created_by: mona.id });
      if (hash(d + 'dl') < 220) tx({ type: 'expense', account_id: WALLET.id, category_id: cat('دليفري'), amount_minor: between(150, 380, d + 'dl2'), occurred_on: d, payee: ['دليفري كشري', 'دليفري بيتزا', 'دليفري مشويات'][hash(d + 'dl3') % 3], created_by: sharedBy(d + 'dl') });
      if (wd === 4 && hash(d + 'rs') % 2 === 0) tx({ type: 'expense', account_id: CARD.id, category_id: cat('مطاعم وكافيهات'), amount_minor: between(450, 950, d + 'rs2'), occurred_on: d, payee: 'عشا برّه', created_by: ahmed.id });
      if (dn === 4 || dn === 18) tx({ type: 'expense', account_id: CARD.id, category_id: cat('بنزين'), amount_minor: between(650, 850, d + 'fuel'), occurred_on: d, payee: 'بنزينة', created_by: ahmed.id });
      if (hash(d + 'tx') < 280) tx({ type: 'expense', account_id: WALLET.id, category_id: cat('أوبر وتاكسي'), amount_minor: between(60, 170, d + 'tx2'), occurred_on: d, payee: 'مشوار تاكسي', created_by: sharedBy(d + 'tx') });
      if (hash(d + 'ph') < 70) tx({ type: 'expense', account_id: CASH.id, category_id: cat('أدوية'), amount_minor: between(90, 420, d + 'ph2'), occurred_on: d, payee: 'صيدلية', created_by: mona.id });
      if (hash(d + 'dr') < 25) tx({ type: 'expense', account_id: CASH.id, category_id: cat('كشف ودكتور'), amount_minor: between(350, 600, d + 'dr2'), occurred_on: d, payee: 'عيادة الأطفال', created_by: mona.id });
      if (dn === 12) tx({ type: 'expense', account_id: CARD.id, category_id: cat('لبس'), amount_minor: between(900, 2400, d + 'cl'), occurred_on: d, payee: 'محل هدوم', created_by: mona.id });
      if (wd === 6 && hash(d + 'fun') % 3 === 0) tx({ type: 'expense', account_id: CARD.id, category_id: cat('ترفيه وخروجات'), amount_minor: between(250, 700, d + 'fun2'), occurred_on: d, payee: 'خروجة العيلة', created_by: ahmed.id });
      if (dn === 15) tx({ type: 'expense', account_id: CASH.id, category_id: cat('مياه'), amount_minor: between(110, 160, d + 'wt'), occurred_on: d, payee: 'فاتورة المياه', created_by: mona.id });
      if (dn === 19) tx({ type: 'expense', account_id: CASH.id, category_id: cat('غاز'), amount_minor: between(60, 90, d + 'gas'), occurred_on: d, payee: 'فاتورة الغاز', created_by: mona.id });
      if (dn === 14 && hash(monthOf(d) + 'fl') % 2 === 0) tx({ type: 'income', account_id: BANK.id, category_id: cat('شغل حر'), amount_minor: between(3000, 5000, d + 'fl2'), occurred_on: d, payee: 'مشروع تصميم', created_by: ahmed.id });
      if (wd === 0 && schoolDone < 2 && (schoolDone === 0 || diffDays(W, d) > 70)) {
        schoolDone += 1;
        tx({ type: 'expense', account_id: BANK.id, category_id: cat('مصاريف مدارس'), amount_minor: 900000, occurred_on: d, payee: 'المدرسة', note: schoolDone === 1 ? 'القسط الأول' : 'القسط التاني', created_by: ahmed.id });
      }
      // مصروف الأولاد: البيت يسجّله مصروف، والابن يسجّله دخل في جيبه (اللي محدش غيره يشوفه)
      if (dn === 1) {
        tx({ type: 'expense', account_id: CASH.id, category_id: cat('مصروف الأولاد'), amount_minor: 50000, occurred_on: d, payee: 'يوسف', note: 'مصروف الشهر', created_by: mona.id });
        tx({ type: 'income', account_id: P_YOUSSEF.id, category_id: cat('هدايا وعيديات'), amount_minor: 50000, occurred_on: d, payee: 'ماما', note: 'مصروف الشهر', created_by: youssef.id });
        tx({ type: 'expense', account_id: BANK.id, category_id: cat('مصروف الأولاد'), amount_minor: 100000, occurred_on: d, payee: 'سلمى', note: 'مصروف الشهر', created_by: ahmed.id });
        tx({ type: 'income', account_id: P_SALMA.id, category_id: cat('دخل آخر'), amount_minor: 100000, occurred_on: d, payee: 'بابا', note: 'مصروف الشهر', created_by: salma.id });
      }
      // تحويلات من البيت لجيوب الأبوين (الطرف الخاص يظهر للباقيين «حساب خاص»)
      if (dn === 2) tx({ type: 'transfer', account_id: BANK.id, to_account_id: P_MONA.id, amount_minor: 150000, occurred_on: d, note: 'مصروفي الشخصي', created_by: mona.id });
      if (dn === 26) tx({ type: 'transfer', account_id: BANK.id, to_account_id: P_AHMED.id, amount_minor: 200000, occurred_on: d, note: 'مصروفي الشخصي', created_by: ahmed.id });
      // الجيوب الخاصة
      if ((wd === 0 || wd === 2 || wd === 3) && hash(d + 'cf') % 2 === 0) tx({ type: 'expense', account_id: P_AHMED.id, category_id: cat('مطاعم وكافيهات'), amount_minor: between(35, 90, d + 'cf2'), occurred_on: d, payee: 'قهوة الصبح', created_by: ahmed.id });
      if (dn === 10) tx({ type: 'transfer', account_id: P_AHMED.id, to_account_id: CASH.id, amount_minor: 50000, occurred_on: d, note: 'مساهمة في البيت', created_by: ahmed.id });
      if (hash(d + 'gf') < 40) tx({ type: 'expense', account_id: P_MONA.id, category_id: cat('هدايا ومناسبات'), amount_minor: between(150, 600, d + 'gf2'), occurred_on: d, payee: 'هدية', created_by: mona.id });
      if (hash(d + 'mc') < 30) tx({ type: 'expense', account_id: P_MONA.id, category_id: cat('لبس'), amount_minor: between(300, 900, d + 'mc2'), occurred_on: d, payee: 'شنطة وإكسسوار', created_by: mona.id });
      if (wd <= 4 && hash(d + 'mt') < 450) tx({ type: 'expense', account_id: P_SALMA.id, category_id: cat('مواصلات عامة'), amount_minor: between(15, 40, d + 'mt2'), occurred_on: d, payee: 'مترو', created_by: salma.id });
      if (hash(d + 'bk') < 50) tx({ type: 'expense', account_id: P_SALMA.id, category_id: cat('كتب وأدوات'), amount_minor: between(50, 250, d + 'bk2'), occurred_on: d, payee: 'مكتبة الكلية', created_by: salma.id });
      if (hash(d + 'sc') < 40) tx({ type: 'expense', account_id: P_SALMA.id, category_id: cat('مطاعم وكافيهات'), amount_minor: between(60, 180, d + 'sc2'), occurred_on: d, payee: 'كافيه مع صحابي', created_by: salma.id });
      if (hash(d + 'yc') < 300) tx({ type: 'expense', account_id: P_YOUSSEF.id, category_id: cat('ترفيه وخروجات'), amount_minor: between(15, 60, d + 'yc2'), occurred_on: d, payee: 'حاجة حلوة', created_by: youssef.id });
      if (hash(d + 'yb') < 60) tx({ type: 'expense', account_id: P_YOUSSEF.id, category_id: cat('كتب وأدوات'), amount_minor: between(20, 80, d + 'yb2'), occurred_on: d, payee: 'كشاكيل وأقلام', created_by: youssef.id });
    });
    tx({ type: 'expense', account_id: CARD.id, category_id: cat('هدايا ومناسبات'), amount_minor: 120000, occurred_on: addDays(W, 33), payee: 'هدية فرح', created_by: mona.id });
    tx({ type: 'expense', account_id: CASH.id, category_id: cat('صيانة وتصليحات'), amount_minor: 65000, occurred_on: addDays(T, -9), payee: 'سبّاك', note: 'تغيير خلاط المطبخ', created_by: ahmed.id });

    /* الفواتير المتكرّرة */
    const rule = (o, by) => {
      const r = Object.assign({ id: seq(db, 'rule'), household_id: HH.id, to_account_id: null, category_id: null, payee: null, note: null, interval_count: 1, end_on: null, total_count: null, auto_post: 0, created_by: by.id, created_at: stamp(addDays(W, -1), o.name), updated_at: stamp(addDays(W, -1), o.name) }, o);
      db.rules.push(r);
      return r;
    };
    // يسجّل مواعيد القاعدة اللي فاتت (مع استثناءات) — زي «دفعت» في يومها أو بعده بيوم
    const postPast = (r, by, o) => {
      o = o || {};
      occurrencesBetween(r, { to: o.until || T }).forEach((occ, i) => {
        if (o.skipLast && occ.due_on === o.skipLast) return;
        const late = o.late ? hash(occ.due_on + r.name) % 2 : 0;
        const occurred = addDays(occ.due_on, late) > T ? occ.due_on : addDays(occ.due_on, late);
        const amount = o.amount ? o.amount(occ, i) : undefined;
        const at = stamp(occurred, r.name);
        postOccurrence(db, by, r, occ.due_on, { occurred_on: occurred, amount_minor: amount }, r.auto_post ? null : by.id, at);
      });
    };
    const R = {};
    R.salaryA = rule({ name: 'مرتب أحمد', type: 'income', account_id: BANK.id, category_id: cat('مرتب'), amount_minor: 2500000, payee: 'الشركة', frequency: 'monthly', start_on: firstOn(25), auto_post: 1 }, ahmed);
    R.salaryM = rule({ name: 'مرتب منى', type: 'income', account_id: BANK.id, category_id: cat('مرتب'), amount_minor: 1200000, payee: 'المدرسة', frequency: 'monthly', start_on: firstOn(1), auto_post: 1 }, mona);
    R.rent = rule({ name: 'إيجار الشقة', type: 'expense', account_id: BANK.id, category_id: cat('إيجار'), amount_minor: 750000, payee: 'صاحب الشقة', frequency: 'monthly', start_on: firstOn(1) }, ahmed);
    R.net = rule({ name: 'إنترنت البيت', type: 'expense', account_id: BANK.id, category_id: cat('إنترنت البيت'), amount_minor: 55000, payee: 'شركة الإنترنت', frequency: 'monthly', start_on: firstOn(8), auto_post: 1 }, ahmed);
    R.phones = rule({ name: 'باقات الموبايلات', type: 'expense', account_id: WALLET.id, category_id: cat('رصيد وباقات'), amount_minor: 30000, frequency: 'monthly', start_on: firstOn(6), auto_post: 1 }, mona);
    const elecDue = safeDay(addDays(T, -3));
    R.elec = rule({ name: 'فاتورة الكهرباء', type: 'expense', account_id: CASH.id, category_id: cat('كهرباء'), amount_minor: 80000, payee: 'شركة الكهرباء', note: 'المبلغ بيتغيّر كل شهر', frequency: 'monthly', start_on: monthsShift(elecDue, -4) }, mona);
    R.lessons = rule({ name: 'دروس يوسف', type: 'expense', account_id: CASH.id, category_id: cat('دروس خصوصية'), amount_minor: 160000, payee: 'مستر حسام', frequency: 'monthly', start_on: monthsShift(safeDay(addDays(T, 4)), -4) }, mona);
    R.weekly = rule({ name: 'مصروف البيت الأسبوعي', type: 'transfer', account_id: BANK.id, to_account_id: CASH.id, amount_minor: 150000, frequency: 'weekly', start_on: addDays(T, -7 * Math.floor(diffDays(W, T) / 7)) }, ahmed);
    R.club = rule({ name: 'اشتراك النادي', type: 'expense', account_id: BANK.id, category_id: cat('ترفيه وخروجات'), amount_minor: 650000, payee: 'النادي', frequency: 'yearly', start_on: addDays(T, 20) }, ahmed);
    R.charity = rule({ name: 'صدقة شهرية', type: 'expense', account_id: CASH.id, category_id: cat('صدقات وزكاة'), amount_minor: 50000, frequency: 'monthly', start_on: firstOn(26) }, ahmed);
    R.wallet = rule({ name: 'شحن المحفظة', type: 'transfer', account_id: BANK.id, to_account_id: WALLET.id, amount_minor: 350000, frequency: 'monthly', start_on: firstOn(2), auto_post: 1 }, mona);
    R.saving = rule({ name: 'تحويل للادخار', type: 'transfer', account_id: BANK.id, to_account_id: SAVINGS.id, amount_minor: 300000, frequency: 'monthly', start_on: firstOn(26), auto_post: 1 }, ahmed);
    R.card = rule({ name: 'سداد الكارت', type: 'transfer', account_id: BANK.id, to_account_id: CARD.id, amount_minor: 1250000, frequency: 'monthly', start_on: firstOn(20) }, ahmed);
    R.gym = rule({ name: 'اشتراك الجيم', type: 'expense', account_id: P_SALMA.id, category_id: cat('ترفيه وخروجات'), amount_minor: 35000, payee: 'الجيم', frequency: 'monthly', start_on: firstOn(10) }, salma);

    postPast(R.salaryA, A);
    postPast(R.salaryM, M);
    postPast(R.rent, A, { late: true });
    postPast(R.net, A);
    postPast(R.phones, M);
    postPast(R.elec, M, { skipLast: elecDue, late: true, amount: (occ) => between(620, 980, occ.due_on + 'elec') });
    postPast(R.lessons, M, { until: addDays(T, -1) });
    postPast(R.weekly, A, { until: addDays(T, -1) });
    postPast(R.charity, A);
    postPast(R.wallet, M);
    postPast(R.saving, A);
    postPast(R.card, A, { late: true });
    postPast(R.gym, S, { late: true });

    /* التقسيط */
    const plan = (o, by, settleFirst) => {
      const p = Object.assign({ id: seq(db, 'plan'), household_id: HH.id, note: null, down_payment_minor: 0, created_by: by.id, created_at: stamp(o.purchase_on, o.name), updated_at: stamp(o.purchase_on, o.name) }, o);
      db.plans.push(p);
      insertItems(db, p.id, buildSchedule(p));
      db.items.filter((i) => i.plan_id === p.id).forEach((i) => {
        if (i.due_on >= T) return;
        if (settleFirst && i.seq <= settleFirst) { i.settled_at = p.created_at; i.settled_by = by.id; return; }
        if (p.skipSeq && i.seq === p.skipSeq) return;
        const label = i.seq === 0 ? 'المقدّم' : 'قسط ' + i.seq + ' من ' + p.installment_count;
        const t = createTx(db, ctx(by), { type: 'expense', account_id: p.account_id, category_id: p.category_id, amount_minor: i.amount_minor, occurred_on: i.due_on, payee: p.payee || p.name, note: p.payee ? label + ' — ' + p.name : label }, by.id, stamp(i.due_on, p.name));
        i.transaction_id = t.id;
      });
      delete p.skipSeq;
      return p;
    };
    const phoneBuy = safeDay(addDays(T, -100));
    plan({ name: 'موبايل سلمى', account_id: CARD.id, category_id: cat('أقساط وديون'), payee: 'محل الموبايلات', total_minor: 2400000, down_payment_minor: 400000, installment_count: 10, purchase_on: phoneBuy, first_due_on: monthsShift(phoneBuy, 1) }, ahmed);
    const fridgeFirst = safeDay(addDays(T, -40));
    plan({ name: 'تلاجة جديدة', account_id: CARD.id, category_id: cat('أقساط وديون'), payee: 'معرض الأجهزة', total_minor: 1800000, installment_count: 12, purchase_on: monthsShift(fridgeFirst, -1), first_due_on: fridgeFirst, skipSeq: 2 }, mona);
    const washerFirst = safeDay(addDays(T, -190));
    plan({ name: 'غسالة', account_id: CARD.id, category_id: cat('أقساط وديون'), payee: 'معرض الأجهزة', total_minor: 900000, installment_count: 6, purchase_on: monthsShift(washerFirst, -1), first_due_on: washerFirst }, ahmed, 3);

    /* ميزانيات الشهر */
    const budget = (name, amount, alert) => db.budgets.push({ id: seq(db, 'budget'), household_id: HH.id, category_id: cat(name), amount_minor: amount, alert_bps: alert || 8000, created_by: mona.id, created_at: stamp(addDays(W, 1), name), updated_at: stamp(addDays(W, 1), name) });
    budget('أكل وشرب', 900000);
    budget('مطاعم وكافيهات', 200000);
    budget('مواصلات', 350000);
    budget('اتصالات وإنترنت', 100000);
    budget('ترفيه وخروجات', 150000, 7000);
    budget('صحة', 120000);
    budget('لبس', 250000);

    /* سجل التغييرات: الإعداد + آخر 3 أسابيع على الحسابات المشتركة */
    audit(db, A, 'auth.register', 'household', HH.id, undefined, undefined, createdAt);
    [mona, salma, youssef].forEach((u) => audit(db, A, 'member.create', 'user', u.id, undefined, briefMember(u), u.created_at));
    db.accounts.forEach((a) => audit(db, ctx(findUser(db, a.created_by)), 'account.create', 'account', a.id, undefined, { id: a.id, name: a.name, type: a.type, is_shared: isShared(a), opening_balance_minor: a.opening_balance_minor, archived_at: null }, a.created_at));
    db.budgets.forEach((b) => audit(db, M, 'budget.create', 'budget', b.id, undefined, briefBudget(b), b.created_at));
    db.rules.forEach((r) => audit(db, ctx(findUser(db, r.created_by)), 'recurring.create', 'recurring_rule', r.id, undefined, briefRule(r), r.created_at));
    db.plans.forEach((p) => audit(db, ctx(findUser(db, p.created_by)), 'installment.create', 'installment_plan', p.id, undefined, briefPlan(Object.assign({}, p, { total_minor: p.total_minor })), p.created_at));
    const recent = addDays(T, -21);
    db.transactions.forEach((t) => {
      if (t.occurred_on < recent || !t.created_by || !isShared(findAccount(db, t.account_id))) return;
      const by = ctx(findUser(db, t.created_by));
      audit(db, by, 'transaction.create', 'transaction', t.id, undefined, briefTx(t), t.created_at);
      const posting = db.postings.find((p) => p.transaction_id === t.id);
      if (posting) {
        const r = db.rules.find((x) => x.id === posting.rule_id);
        audit(db, by, 'recurring.post', 'recurring_rule', r.id, undefined, { name: r.name, due_on: posting.due_on, transaction_id: t.id, amount_minor: t.amount_minor, ...(r.auto_post ? { auto: true } : {}) }, t.created_at);
      }
      const item = db.items.find((i) => i.transaction_id === t.id);
      if (item) {
        const p = db.plans.find((x) => x.id === item.plan_id);
        audit(db, by, 'installment.pay', 'installment_plan', p.id, undefined, { name: p.name, seq: item.seq, due_on: item.due_on, transaction_id: t.id, amount_minor: t.amount_minor }, t.created_at);
      }
    });
    [ahmed, mona, salma].forEach((u) => audit(db, ctx(u), 'auth.login', 'user', u.id, undefined, undefined, u.last_login_at));
    // الترتيب الزمني (السجل بيتعرض الأحدث أولًا بالمعرّف)
    db.audit.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    db.audit.forEach((e, i) => { e.id = i + 1; });
    db.seq.audit = db.audit.length;
  }

  /* ---------- المسارات ---------- */

  let autoChecked = false;

  function handle(req, db, h) {
    H = h;
    if (!autoChecked) {
      autoChecked = true;
      try { postDueAuto(db); } catch (e) { /* تكمل من غيره */ }
    }
    try {
      return route(req, db);
    } catch (e) {
      if (e && e.demo) return e.demo;
      throw e;
    }
  }

  const boolish = (v) => v === true || v === 'true' || v === '1';
  const pageOf = (q) => ({
    page: Math.min(100000, Math.max(1, parseInt(q.page, 10) || 1)),
    size: Math.min(100, Math.max(1, parseInt(q.page_size, 10) || 25)),
  });
  const pick = (body, fields) => {
    const out = {};
    fields.forEach((f) => { if (body[f] !== undefined) out[f] = body[f]; });
    return out;
  };

  function route(req, db) {
    const method = req.method;
    const path = req.path.replace(/\/+$/, '') || '/';
    const q = req.query || {};
    const b = req.body || {};
    let m;

    /* --- المصادقة (من غير جلسة) --- */
    if (path === '/auth/options' && method === 'GET') return ok({ signup_enabled: true });

    if (path === '/auth/register' && method === 'POST') {
      check({
        household_name: V.text(b.household_name, { required: true, min: 2, max: 120 }),
        full_name: V.text(b.full_name, { required: true, min: 2, max: 120 }),
        email: V.email(b.email, { required: true }),
        phone: V.phone(b.phone),
        password: V.password(b.password || ''),
      });
      if (emailUsed(db, b.email)) throw conflict('البريد ده مستخدم بالفعل', 'EMAIL_TAKEN', { email: 'مستخدم بالفعل' });
      const at = nowIso();
      const household = { id: seq(db, 'household'), uuid: uuid(), name: b.household_name.trim(), currency: 'EGP', timezone: TZ, month_start_day: 1, status: 'active', created_at: at };
      db.households.push(household);
      const owner = { id: seq(db, 'user'), uuid: uuid(), household_id: household.id, full_name: b.full_name.trim(), email: b.email.trim().toLowerCase(), phone: optText(b.phone) || null, role: 'owner', status: 'active', must_change_password: 0, password: b.password, failed_logins: 0, last_login_at: null, created_at: at, deleted_at: null };
      db.users.push(owner);
      seedDefaultCategories(db, household.id, at);
      audit(db, userCtx(db, owner), 'auth.register', 'household', household.id);
      return created(startSession(db, owner.id));
    }

    if (path === '/auth/login' && method === 'POST') {
      check({ email: V.email(b.email, { required: true }), password: V.text(b.password, { required: true, max: 128 }) });
      const u = db.users.find((x) => x.email.toLowerCase() === String(b.email).trim().toLowerCase() && !x.deleted_at);
      if (!u || u.password !== b.password) throw fail(401, 'البريد أو كلمة المرور غير صحيحة', 'BAD_CREDENTIALS');
      if (u.status !== 'active') throw fail(403, 'الحساب موقوف — كلّم صاحب الأسرة', 'USER_SUSPENDED');
      const session = startSession(db, u.id);
      audit(db, userCtx(db, u), 'auth.login', 'user', u.id);
      return ok(session);
    }

    if (path === '/auth/refresh' && method === 'POST') {
      const u = currentUser(db);
      if (!u) {
        db.session = null;
        throw fail(401, 'مفيش جلسة — سجّل الدخول', 'NO_SESSION');
      }
      return ok(sessionPayload(db, u.id));
    }

    if (path === '/auth/logout' && method === 'POST') {
      db.session = null;
      return noContent();
    }

    if (path === '/auth/forgot-password' && method === 'POST') {
      check({ email: V.email(b.email, { required: true }) });
      return ok({ message: 'لو البريد مسجّل عندنا هيوصلك رابط الاستعادة خلال دقائق' });
    }

    if (path === '/auth/reset-password' && method === 'POST') {
      check({ new_password: V.password(b.new_password || '') });
      throw fail(400, 'الرابط غير صالح أو انتهت صلاحيته — اطلب رابط جديد', 'RESET_INVALID');
    }

    /* --- كل اللي بعد كده محتاج جلسة --- */
    const user = currentUser(db);
    if (!user) throw fail(401, 'لازم تسجّل الدخول للمتابعة', 'NO_TOKEN');
    const loose = (path === '/auth/me' && method === 'GET') || path === '/auth/change-password';
    if (user.must_change_password && !loose) throw fail(403, 'لازم تغيّر كلمة المرور الأول', 'PASSWORD_CHANGE_REQUIRED');
    const need = function () {
      const perms = Array.prototype.slice.call(arguments);
      if (!perms.some((p) => can(user.role, p))) throw forbidden();
    };
    const me = findUser(db, user.id);

    if (path === '/auth/me' && method === 'GET') return ok(publicUser(user));
    if (path === '/auth/me' && method === 'PATCH') {
      check({ full_name: V.text(b.full_name, { min: 2, max: 120 }), phone: V.phone(b.phone) });
      if (b.full_name !== undefined) me.full_name = b.full_name.trim();
      if (b.phone !== undefined) me.phone = optText(b.phone) || null;
      return ok(publicUser(userCtx(db, me)));
    }
    if (path === '/auth/change-password' && method === 'POST') {
      check({ current_password: V.text(b.current_password, { required: true, max: 128 }), new_password: V.password(b.new_password || '') });
      if (b.current_password !== me.password) throw fail(400, 'كلمة المرور الحالية غير صحيحة', 'WRONG_PASSWORD', { current_password: 'غير صحيحة' });
      if (b.new_password === me.password) throw fail(400, 'كلمة المرور الجديدة لازم تختلف عن الحالية', 'SAME_PASSWORD', { new_password: 'لازم تختلف عن الحالية' });
      me.password = b.new_password;
      me.must_change_password = 0;
      audit(db, user, 'auth.password_changed', 'user', user.id);
      return ok(startSession(db, me.id));
    }
    if (path === '/auth/logout-all' && method === 'POST') {
      db.session = null;
      return noContent();
    }
    if (path === '/auth/sessions' && method === 'GET') {
      return ok([{ id: db.session.familyId, client_type: 'web', user_agent: navigator.userAgent, ip_address: null, started_at: db.session.started_at, last_active_at: nowIso() }]);
    }
    if ((m = /^\/auth\/sessions\/([^/]+)$/.exec(path)) && method === 'DELETE') {
      if (m[1] !== db.session.familyId) throw notFound('الجلسة غير موجودة');
      db.session = null;
      return noContent();
    }

    /* --- الأسرة --- */
    const household = db.households.find((x) => x.id === user.household_id);
    if (path === '/household' && method === 'GET') return ok(presentHousehold(db, household));
    if (path === '/household' && method === 'PATCH') {
      need('household.manage');
      strict(b, ['name', 'currency', 'timezone', 'month_start_day']);
      let tzOk = true;
      if (b.timezone !== undefined) { try { new Intl.DateTimeFormat('en', { timeZone: b.timezone }).format(); } catch (e) { tzOk = false; } }
      check({
        name: V.text(b.name, { min: 2, max: 120 }),
        currency: V.oneOf(b.currency, ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'QAR', 'GBP']),
        timezone: tzOk ? null : 'منطقة زمنية غير معروفة',
        month_start_day: V.int(b.month_start_day, { min: 1, max: 28 }),
      });
      const before = presentHousehold(db, household);
      ['name', 'currency', 'timezone', 'month_start_day'].forEach((f) => { if (b[f] !== undefined) household[f] = typeof b[f] === 'string' ? b[f].trim() : b[f]; });
      const after = presentHousehold(db, household);
      audit(db, user, 'household.update', 'household', household.id, before, after);
      return ok(after);
    }

    /* --- الأفراد --- */
    if (path === '/members' && method === 'GET') {
      return ok(db.users.filter((u) => u.household_id === user.household_id && !u.deleted_at)
        .sort((a, c) => ROLE_ORDER[a.role] - ROLE_ORDER[c.role] || a.full_name.localeCompare(c.full_name, 'ar'))
        .map((u) => presentMember(user, u)));
    }
    if (path === '/members' && method === 'POST') {
      need('household.manage');
      check({
        full_name: V.text(b.full_name, { required: true, min: 2, max: 120 }),
        email: V.email(b.email, { required: true }),
        phone: V.phone(b.phone),
        role: V.oneOf(b.role, ROLES, { required: true }),
        password: b.password ? V.password(b.password) : null,
      });
      if (b.role === 'owner' && user.role !== 'owner') throw fail(403, 'صاحب الأسرة وحده يضيف صاحبًا', 'OWNER_ONLY');
      if (emailUsed(db, b.email)) throw conflict('البريد ده مستخدم بالفعل', 'EMAIL_TAKEN', { email: 'مستخدم بالفعل' });
      const plain = b.password || tempPassword();
      const u = { id: seq(db, 'user'), uuid: uuid(), household_id: user.household_id, full_name: b.full_name.trim(), email: b.email.trim().toLowerCase(), phone: optText(b.phone) || null, role: b.role, status: 'active', must_change_password: 1, password: plain, failed_logins: 0, last_login_at: null, created_at: nowIso(), deleted_at: null };
      db.users.push(u);
      audit(db, user, 'member.create', 'user', u.id, undefined, briefMember(u));
      return created({ member: fullMember(u), temp_password: b.password ? null : plain });
    }
    if ((m = /^\/members\/(\d+)(?:\/(temp-password))?$/.exec(path))) {
      need('household.manage');
      const target = memberOf(db, user, m[1]);
      if (m[2] === 'temp-password' && method === 'POST') {
        if (target.role === 'owner' && user.role !== 'owner') throw fail(403, 'صاحب الأسرة وحده يعدّل حساب صاحب', 'OWNER_ONLY');
        if (target.id === user.id) throw fail(403, 'غيّر كلمة مرورك من الإعدادات', 'SELF_CHANGE');
        const plain = tempPassword();
        target.password = plain;
        target.must_change_password = 1;
        audit(db, user, 'member.temp_password', 'user', target.id);
        return ok({ temp_password: plain });
      }
      if (m[2]) return null;
      if (method === 'GET') return ok(fullMember(target));
      if (target.role === 'owner' && user.role !== 'owner') throw fail(403, 'صاحب الأسرة وحده يعدّل حساب صاحب', 'OWNER_ONLY');
      if (method === 'PATCH') {
        strict(b, ['full_name', 'phone', 'role', 'status']);
        check({ full_name: V.text(b.full_name, { min: 2, max: 120 }), phone: V.phone(b.phone), role: V.oneOf(b.role, ROLES), status: V.oneOf(b.status, ['active', 'suspended']) });
        const touchesRole = b.role !== undefined && b.role !== target.role;
        const touchesStatus = b.status !== undefined && b.status !== target.status;
        if (target.id === user.id && (touchesRole || touchesStatus)) throw fail(403, 'مينفعش تغيّر دورك أو حالتك بنفسك', 'SELF_CHANGE');
        if (b.role === 'owner' && user.role !== 'owner') throw fail(403, 'صاحب الأسرة وحده يرقّي لصاحب', 'OWNER_ONLY');
        const losesOwnership = target.role === 'owner' && ((touchesRole && b.role !== 'owner') || b.status === 'suspended');
        if (losesOwnership && activeOwners(db, user.household_id, target.id) === 0) throw conflict('لازم يفضل صاحب نشط واحد على الأقل', 'LAST_OWNER');
        const before = briefMember(target);
        if (b.full_name !== undefined) target.full_name = b.full_name.trim();
        if (b.phone !== undefined) target.phone = optText(b.phone) || null;
        if (b.role !== undefined) target.role = b.role;
        if (b.status !== undefined) target.status = b.status;
        audit(db, user, 'member.update', 'user', target.id, before, briefMember(target));
        return ok(fullMember(target));
      }
      if (method === 'DELETE') {
        if (target.id === user.id) throw fail(403, 'مينفعش تحذف حسابك', 'SELF_DELETE');
        if (target.role === 'owner' && activeOwners(db, user.household_id, target.id) === 0) throw conflict('مينفعش تحذف آخر صاحب للأسرة', 'LAST_OWNER');
        const before = briefMember(target);
        const at = nowIso();
        target.deleted_at = at;
        target.status = 'suspended';
        target.email = ('deleted-' + target.id + '-' + target.email).slice(0, 190);
        db.accounts.forEach((a) => { if (a.owner_user_id === target.id && !a.archived_at) a.archived_at = at; });
        audit(db, user, 'member.delete', 'user', target.id, before);
        return noContent();
      }
    }

    /* --- الحسابات --- */
    if (path === '/accounts' && method === 'GET') {
      need('accounts.read', 'accounts.own');
      return ok(listAccounts(db, user, boolish(q.include_archived)));
    }
    if (path === '/accounts' && method === 'POST') {
      need('accounts.manage', 'accounts.own');
      validateAccountFields(b, true);
      const shared = (b.scope || 'shared') === 'shared';
      if (shared && !can(user.role, 'accounts.manage')) throw fail(403, 'إضافة حساب مشترك لصاحب الأسرة أو المشرف — تقدر تضيف حساب خاص بيك', 'FORBIDDEN');
      if (!shared && !can(user.role, 'accounts.own')) throw forbidden();
      const ownerId = shared ? null : user.id;
      if (accountNameTaken(db, user, b.name, ownerId, 0)) throw conflict('عندك حساب نشط بنفس الاسم', 'NAME_TAKEN', { name: 'مستخدم بالفعل' });
      const at = nowIso();
      const a = {
        id: seq(db, 'account'), household_id: user.household_id, owner_user_id: ownerId, name: b.name.trim(), type: b.type,
        institution: optText(b.institution) || null, opening_balance_minor: b.opening_balance_minor || 0,
        credit_limit_minor: b.credit_limit_minor === undefined ? null : b.credit_limit_minor, color: b.color || '#0d6b57',
        include_in_net_worth: b.include_in_net_worth === false ? 0 : 1, sort_order: b.sort_order || 0, archived_at: null,
        created_by: user.id, created_at: at, updated_at: at,
      };
      db.accounts.push(a);
      const result = presentAccount(db, user, a, balances(db, user.household_id));
      audit(db, user, 'account.create', 'account', a.id, undefined, briefAccount(result));
      return created(result);
    }
    if ((m = /^\/accounts\/(\d+)$/.exec(path))) {
      need('accounts.read', 'accounts.own');
      const a = visibleAccount(db, user, m[1]);
      const bal = () => balances(db, user.household_id);
      if (method === 'GET') return ok(presentAccount(db, user, a, bal()));
      need('accounts.manage', 'accounts.own');
      const before = presentAccount(db, user, a, bal());
      if (method === 'PATCH') {
        strict(b, ['name', 'type', 'institution', 'opening_balance_minor', 'credit_limit_minor', 'color', 'include_in_net_worth', 'sort_order', 'archived']);
        validateAccountFields(b, false);
        if (!before.can_manage) throw fail(403, 'مينفعش تعدّل الحساب ده', 'FORBIDDEN');
        const restoring = b.archived === false && a.archived_at;
        if (b.name !== undefined && (!a.archived_at || restoring) && accountNameTaken(db, user, b.name, a.owner_user_id, a.id)) throw conflict('عندك حساب نشط بنفس الاسم', 'NAME_TAKEN', { name: 'مستخدم بالفعل' });
        if (restoring && b.name === undefined && accountNameTaken(db, user, a.name, a.owner_user_id, a.id)) throw conflict('عندك حساب نشط بنفس الاسم', 'NAME_TAKEN', { name: 'مستخدم بالفعل' });
        ['name', 'type', 'institution', 'opening_balance_minor', 'credit_limit_minor', 'color', 'sort_order'].forEach((f) => {
          if (b[f] !== undefined) a[f] = f === 'name' ? b[f].trim() : f === 'institution' ? optText(b[f]) || null : b[f];
        });
        if (b.include_in_net_worth !== undefined) a.include_in_net_worth = b.include_in_net_worth ? 1 : 0;
        if (b.archived !== undefined) a.archived_at = b.archived ? a.archived_at || nowIso() : null;
        a.updated_at = nowIso();
        const after = presentAccount(db, user, a, bal());
        audit(db, user, 'account.update', 'account', a.id, briefAccount(before), briefAccount(after));
        return ok(after);
      }
      if (method === 'DELETE') {
        if (!before.can_manage) throw fail(403, 'مينفعش تحذف الحساب ده', 'FORBIDDEN');
        const used = db.transactions.some((t) => t.account_id === a.id || t.to_account_id === a.id)
          || db.rules.some((r) => r.account_id === a.id || r.to_account_id === a.id)
          || db.plans.some((p) => p.account_id === a.id);
        if (!used) {
          db.accounts = db.accounts.filter((x) => x.id !== a.id);
          audit(db, user, 'account.delete', 'account', a.id, briefAccount(before));
          return noContent();
        }
        a.archived_at = a.archived_at || nowIso();
        audit(db, user, 'account.archive', 'account', a.id, briefAccount(before));
        return ok({ archived: true });
      }
    }

    /* --- التصنيفات --- */
    if (path === '/categories' && method === 'GET') {
      if (q.kind) check({ kind: V.oneOf(q.kind, ['expense', 'income']) });
      const includeArchived = boolish(q.include_archived);
      return ok(sortCategories(db, db.categories.filter((c) => c.household_id === user.household_id && (!q.kind || c.kind === q.kind) && (includeArchived || !c.archived_at))).map(presentCategory));
    }
    if (path === '/categories' && method === 'POST') {
      need('categories.manage');
      check({ kind: V.oneOf(b.kind, ['expense', 'income'], { required: true }), name: V.text(b.name, { required: true, max: 60 }), icon: V.text(b.icon, { max: 16 }), color: V.color(b.color), parent_id: V.id(b.parent_id) });
      if (b.parent_id) assertValidParent(db, user, b.parent_id, b.kind);
      const c = { id: seq(db, 'category'), household_id: user.household_id, parent_id: b.parent_id ? Number(b.parent_id) : null, kind: b.kind, name: b.name.trim(), icon: optText(b.icon) || null, color: b.color || '#57534e', sort_order: b.sort_order || 0, archived_at: null, created_at: nowIso() };
      if (categoryNameTaken(db, user, c, 0)) throw conflict('فيه تصنيف بنفس الاسم في نفس المكان', 'NAME_TAKEN', { name: 'مستخدم بالفعل' });
      db.categories.push(c);
      audit(db, user, 'category.create', 'category', c.id, undefined, briefCategory(c));
      return created(presentCategory(c));
    }
    if ((m = /^\/categories\/(\d+)$/.exec(path))) {
      need('categories.manage');
      const c = ownCategory(db, user, m[1]);
      const before = presentCategory(c);
      if (method === 'PATCH') {
        strict(b, ['name', 'icon', 'color', 'sort_order', 'parent_id', 'archived']);
        check({ name: V.text(b.name, { max: 60 }), icon: V.text(b.icon, { max: 16 }), color: V.color(b.color), parent_id: V.id(b.parent_id), archived: V.bool(b.archived) });
        if (b.name !== undefined && empty(b.name)) check({ name: 'الحقل مطلوب' });
        const parentId = b.parent_id === undefined ? c.parent_id : b.parent_id === null ? null : Number(b.parent_id);
        if (b.parent_id !== undefined && parentId !== c.parent_id && parentId !== null) {
          assertValidParent(db, user, parentId, c.kind, c.id);
          if (db.categories.some((x) => x.parent_id === c.id)) throw fail(400, 'التصنيف ده له فروع — مينفعش يبقى فرعي', 'HAS_CHILDREN', { parent_id: 'له فروع' });
        }
        if (b.archived === false && c.parent_id && findCategory(db, c.parent_id).archived_at) throw fail(400, 'رجّع التصنيف الرئيسي الأول', 'PARENT_ARCHIVED');
        const next = Object.assign({}, c, { name: b.name !== undefined ? b.name.trim() : c.name, parent_id: parentId });
        if ((b.name !== undefined || b.parent_id !== undefined) && categoryNameTaken(db, user, next, c.id)) throw conflict('فيه تصنيف بنفس الاسم في نفس المكان', 'NAME_TAKEN', { name: 'مستخدم بالفعل' });
        c.name = next.name;
        c.parent_id = parentId;
        if (b.icon !== undefined) c.icon = optText(b.icon) || null;
        if (b.color !== undefined) c.color = b.color;
        if (b.sort_order !== undefined) c.sort_order = b.sort_order;
        if (b.archived === false) c.archived_at = null;
        if (b.archived === true) archiveCategory(db, c.id);
        audit(db, user, 'category.update', 'category', c.id, briefCategory(before), briefCategory(c));
        return ok(presentCategory(c));
      }
      if (method === 'DELETE') {
        const used = db.transactions.some((t) => t.category_id === c.id) || db.budgets.some((x) => x.category_id === c.id)
          || db.categories.some((x) => x.parent_id === c.id) || db.rules.some((r) => r.category_id === c.id) || db.plans.some((p) => p.category_id === c.id);
        if (!used) {
          db.categories = db.categories.filter((x) => x.id !== c.id);
          audit(db, user, 'category.delete', 'category', c.id, briefCategory(before));
          return noContent();
        }
        archiveCategory(db, c.id);
        audit(db, user, 'category.archive', 'category', c.id, briefCategory(before));
        return ok({ archived: true });
      }
    }

    /* --- العمليات --- */
    if (path === '/transactions' && method === 'GET') {
      need('accounts.read', 'accounts.own');
      check({ from: V.date(q.from), to: V.date(q.to), type: V.oneOf(q.type, ['expense', 'income', 'transfer']) });
      if (q.from && q.to && q.to < q.from) check({ to: 'تاريخ النهاية قبل البداية' });
      const list = filterTx(db, user, q).sort((a, c) => (a.occurred_on < c.occurred_on ? 1 : a.occurred_on > c.occurred_on ? -1 : c.id - a.id));
      const p = pageOf(q);
      const meta = pageMeta(p.page, p.size, list.length);
      meta.totals = {
        income_minor: sum(list.filter((t) => t.type === 'income').map((t) => t.amount_minor)),
        expense_minor: sum(list.filter((t) => t.type === 'expense').map((t) => t.amount_minor)),
      };
      return paged(list.slice((p.page - 1) * p.size, p.page * p.size).map((t) => presentTx(db, user, t)), meta);
    }
    if (path === '/transactions/export' && method === 'GET') {
      need('accounts.read', 'accounts.own');
      const rows = filterTx(db, user, q).sort((a, c) => (a.occurred_on < c.occurred_on ? -1 : a.occurred_on > c.occurred_on ? 1 : a.id - c.id)).slice(0, 20000).map((t) => presentTx(db, user, t));
      const LABELS = { expense: 'مصروف', income: 'دخل', transfer: 'تحويل' };
      const cell = (v) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'number') return String(v);
        let text = String(v);
        if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
        return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      };
      const money = (minor) => Number((minor / 100).toFixed(2));
      const cols = [
        ['التاريخ', (r) => r.occurred_on], ['النوع', (r) => LABELS[r.type]], ['الحساب', (r) => r.account_name], ['إلى حساب', (r) => r.to_account_name],
        ['التصنيف الرئيسي', (r) => r.parent_category_name || r.category_name], ['التصنيف', (r) => (r.parent_category_name ? r.category_name : null)],
        ['المبلغ', (r) => money(r.type === 'expense' ? -r.amount_minor : r.amount_minor)], ['الجهة', (r) => r.payee], ['ملاحظة', (r) => r.note], ['سجّلها', (r) => r.created_by_name],
      ];
      const lines = [cols.map((c) => cell(c[0])).join(',')].concat(rows.map((r) => cols.map((c) => cell(c[1](r))).join(',')));
      const name = 'masrofy-transactions-' + (q.from || 'all') + (q.to ? '_' + q.to : '') + '.csv';
      return { status: 200, raw: true, body: '﻿' + lines.join('\r\n') + '\r\n', headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + name + '"' } };
    }
    if (path === '/transactions' && method === 'POST') {
      need('transactions.write', 'accounts.own');
      validateTx(b, true);
      const t = createTx(db, user, b);
      const result = presentTx(db, user, t);
      audit(db, user, 'transaction.create', 'transaction', t.id, undefined, briefTx(t));
      return created(result);
    }
    if ((m = /^\/transactions\/(\d+)$/.exec(path))) {
      need('accounts.read', 'accounts.own');
      const t = visibleTx(db, user, m[1]);
      if (method === 'GET') return ok(presentTx(db, user, t));
      need('transactions.write', 'accounts.own');
      const before = presentTx(db, user, t);
      if (method === 'PATCH') {
        strict(b, TX_FIELDS);
        validateTx(b, false);
        if (!before.can_edit) throw fail(403, 'مينفعش تعدّل العملية دي', 'FORBIDDEN');
        const merged = {};
        TX_FIELDS.forEach((f) => { merged[f] = b[f] !== undefined ? b[f] : t[f]; });
        const data = normalizeTx(resolveShape(db, user, normalizeTx(merged), t));
        Object.assign(t, data, { updated_at: nowIso() });
        audit(db, user, 'transaction.update', 'transaction', t.id, briefTx(before), briefTx(t));
        return ok(presentTx(db, user, t));
      }
      if (method === 'DELETE') {
        if (!before.can_edit) throw fail(403, 'مينفعش تحذف العملية دي', 'FORBIDDEN');
        deleteTx(db, t.id);
        audit(db, user, 'transaction.delete', 'transaction', t.id, briefTx(before));
        return noContent();
      }
    }

    /* --- الميزانيات --- */
    if (path === '/budgets' && method === 'GET') {
      need('budgets.read');
      if (q.month && !isValidMonth(q.month)) check({ month: 'الشهر لازم بصيغة YYYY-MM' });
      const period = resolvePeriod(user, q.month);
      const rows = db.budgets.filter((x) => x.household_id === user.household_id).map((x) => {
        const c = findCategory(db, x.category_id);
        const p = c.parent_id ? findCategory(db, c.parent_id) : null;
        const spent = spentOn(db, user, x.category_id, period.from, period.to);
        return {
          id: x.id, category_id: x.category_id, amount_minor: x.amount_minor, alert_bps: x.alert_bps,
          category_name: c.name, category_icon: c.icon, category_color: c.color, parent_id: c.parent_id,
          parent_name: p ? p.name : null, parent_icon: p ? p.icon : null,
          spent_minor: spent, remaining_minor: x.amount_minor - spent, used_bps: ratioBps(spent, x.amount_minor),
          status: budgetStatus(spent, x.amount_minor, x.alert_bps),
          _c: c,
        };
      });
      const ordered = sortCategories(db, rows.map((r) => r._c)).map((c) => rows.find((r) => r._c === c));
      ordered.forEach((r) => { delete r._c; });
      const budgeted = new Set(ordered.map((r) => r.category_id));
      const counted = ordered.filter((r) => !r.parent_id || !budgeted.has(r.parent_id));
      const amount = sum(counted.map((r) => r.amount_minor));
      const spent = sum(counted.map((r) => r.spent_minor));
      return ok({ period, budgets: ordered, totals: { amount_minor: amount, spent_minor: spent, remaining_minor: amount - spent, used_bps: ratioBps(spent, amount) } });
    }
    if (path === '/budgets' && method === 'POST') {
      need('budgets.manage');
      check({ category_id: V.id(b.category_id, { required: true }), amount_minor: V.money(b.amount_minor, { required: true }), alert_bps: V.int(b.alert_bps, { min: 1000, max: 10000 }) });
      const c = findCategory(db, b.category_id);
      const problem = !c || c.household_id !== user.household_id ? 'غير موجود' : c.kind !== 'expense' ? 'الميزانية لتصنيفات المصروف بس' : c.archived_at ? 'مؤرشف' : null;
      if (problem) throw fail(422, 'التصنيف ' + problem, 'VALIDATION_ERROR', { category_id: problem });
      if (db.budgets.some((x) => x.household_id === user.household_id && x.category_id === c.id)) throw conflict('التصنيف ده له ميزانية بالفعل — عدّلها', 'BUDGET_EXISTS', { category_id: 'له ميزانية بالفعل' });
      const at = nowIso();
      const x = { id: seq(db, 'budget'), household_id: user.household_id, category_id: c.id, amount_minor: b.amount_minor, alert_bps: b.alert_bps || 8000, created_by: user.id, created_at: at, updated_at: at };
      db.budgets.push(x);
      audit(db, user, 'budget.create', 'budget', x.id, undefined, briefBudget(x));
      return created(briefBudget(x));
    }
    if ((m = /^\/budgets\/(\d+)$/.exec(path))) {
      need('budgets.manage');
      const x = ownBudget(db, user, m[1]);
      const before = briefBudget(x);
      if (method === 'PATCH') {
        strict(b, ['amount_minor', 'alert_bps']);
        check({ amount_minor: V.money(b.amount_minor), alert_bps: V.int(b.alert_bps, { min: 1000, max: 10000 }) });
        if (b.amount_minor !== undefined) x.amount_minor = b.amount_minor;
        if (b.alert_bps !== undefined) x.alert_bps = b.alert_bps;
        x.updated_at = nowIso();
        audit(db, user, 'budget.update', 'budget', x.id, before, briefBudget(x));
        return ok(briefBudget(x));
      }
      if (method === 'DELETE') {
        db.budgets = db.budgets.filter((y) => y.id !== x.id);
        audit(db, user, 'budget.delete', 'budget', x.id, before);
        return noContent();
      }
    }

    /* --- الفواتير المتكرّرة --- */
    if (path === '/recurring' && method === 'GET') {
      need('accounts.read', 'accounts.own');
      return ok(listRules(db, user));
    }
    if (path === '/recurring' && method === 'POST') {
      need('transactions.write', 'accounts.own');
      validateRule(b, true);
      if (b.end_on && b.start_on && b.end_on < b.start_on) check({ end_on: 'تاريخ النهاية قبل أول معاد' });
      const data = resolveRule(db, user, pick(b, RULE_FIELDS));
      const at = nowIso();
      const r = Object.assign({ id: seq(db, 'rule'), household_id: user.household_id }, pick(data, RULE_FIELDS), { auto_post: data.auto_post ? 1 : 0, created_by: user.id, created_at: at, updated_at: at });
      r.name = r.name.trim();
      db.rules.push(r);
      const result = presentRule(db, user, r);
      audit(db, user, 'recurring.create', 'recurring_rule', r.id, undefined, briefRule(result));
      return created(result);
    }
    if ((m = /^\/recurring\/(\d+)(?:\/(post|skip))?$/.exec(path))) {
      need('accounts.read', 'accounts.own');
      const r = visibleRule(db, user, m[1]);
      const present = presentRule(db, user, r);
      if (!m[2] && method === 'GET') {
        const history = db.postings.filter((p) => p.rule_id === r.id).sort((x, y) => (x.due_on < y.due_on ? 1 : -1)).slice(0, 12)
          .map((p) => ({ due_on: p.due_on, status: p.status, transaction_id: p.transaction_id, created_at: p.created_at }));
        return ok(Object.assign({}, present, { history }));
      }
      need('transactions.write', 'accounts.own');
      const editable = (verb) => { if (!present.can_edit) throw fail(403, 'مينفعش ' + verb + ' الفاتورة دي', 'FORBIDDEN'); };
      const assertOccurrence = (dueOn) => { if (occurrenceIndex(r, dueOn) < 0) throw fieldError('due_on', 'التاريخ ده مش من مواعيد الفاتورة'); };
      if (m[2] === 'post' && method === 'POST') {
        strict(b, ['due_on', 'occurred_on', 'amount_minor', 'account_id', 'note']);
        check({ due_on: isValidIso(b.due_on) ? null : 'التاريخ لازم بصيغة YYYY-MM-DD وصالح', occurred_on: V.date(b.occurred_on), amount_minor: V.money(b.amount_minor), account_id: V.id(b.account_id), note: V.text(b.note, { max: 500 }) });
        editable('تسجّل');
        assertOccurrence(b.due_on);
        const res = postOccurrence(db, user, r, b.due_on, { occurred_on: b.occurred_on, amount_minor: b.amount_minor, account_id: b.account_id ? Number(b.account_id) : undefined, note: b.note !== undefined ? optText(b.note) || null : undefined });
        if (!res.already_posted) {
          audit(db, user, 'transaction.create', 'transaction', res.transaction.id, undefined, briefTx(res.transaction));
          audit(db, user, 'recurring.post', 'recurring_rule', r.id, undefined, { name: r.name, due_on: b.due_on, transaction_id: res.transaction.id, amount_minor: res.transaction.amount_minor });
        }
        const body = { due_on: b.due_on, already_posted: res.already_posted, transaction: res.transaction };
        return res.already_posted ? ok(body) : created(body);
      }
      if (m[2] === 'skip' && method === 'POST') {
        strict(b, ['due_on']);
        check({ due_on: isValidIso(b.due_on) ? null : 'التاريخ لازم بصيغة YYYY-MM-DD وصالح' });
        editable('تتخطّى');
        assertOccurrence(b.due_on);
        const existing = db.postings.find((p) => p.rule_id === r.id && p.due_on === b.due_on);
        if (existing && existing.status === 'posted') throw conflict('المعاد ده اتسجّل بالفعل', 'ALREADY_POSTED');
        if (!existing) {
          db.postings.push({ id: seq(db, 'posting'), rule_id: r.id, due_on: b.due_on, status: 'skipped', transaction_id: null, created_by: user.id, created_at: nowIso() });
          audit(db, user, 'recurring.skip', 'recurring_rule', r.id, undefined, { name: r.name, due_on: b.due_on });
        }
        return ok({ due_on: b.due_on, already_skipped: Boolean(existing) });
      }
      if (m[2]) return null;
      if (method === 'PATCH') {
        strict(b, RULE_FIELDS);
        validateRule(b, false);
        editable('تعدّل');
        const merged = {};
        RULE_FIELDS.forEach((f) => { merged[f] = b[f] !== undefined ? b[f] : r[f]; });
        const data = resolveRule(db, user, merged);
        RULE_FIELDS.forEach((f) => { r[f] = data[f]; });
        r.name = String(r.name).trim();
        r.auto_post = data.auto_post ? 1 : 0;
        r.updated_at = nowIso();
        const after = presentRule(db, user, r);
        audit(db, user, 'recurring.update', 'recurring_rule', r.id, briefRule(present), briefRule(after));
        return ok(after);
      }
      if (method === 'DELETE') {
        editable('تحذف');
        db.rules = db.rules.filter((x) => x.id !== r.id);
        db.postings = db.postings.filter((p) => p.rule_id !== r.id);
        audit(db, user, 'recurring.delete', 'recurring_rule', r.id, briefRule(present));
        return noContent();
      }
    }

    /* --- التقسيط --- */
    if (path === '/installments' && method === 'GET') {
      need('accounts.read', 'accounts.own');
      return ok(db.plans.filter((p) => planVisible(db, user, p))
        .sort((x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : y.id - x.id))
        .map((p) => presentPlan(db, user, p).plan)
        .sort((x, y) => ((x.next_item && x.next_item.due_on) || '9999').localeCompare((y.next_item && y.next_item.due_on) || '9999')));
    }
    if (path === '/installments' && method === 'POST') {
      need('transactions.write', 'accounts.own');
      validatePlan(b, true);
      const today = todayIn(user.timezone);
      const data = {
        name: b.name.trim(), account_id: Number(b.account_id), category_id: Number(b.category_id), payee: optText(b.payee) || null, note: optText(b.note) || null,
        total_minor: b.total_minor, down_payment_minor: b.down_payment_minor || 0, installment_count: b.installment_count,
        first_due_on: b.first_due_on, purchase_on: b.purchase_on || (today <= b.first_due_on ? today : b.first_due_on),
      };
      const problem = scheduleProblem(Object.assign({}, data, { purchase_on: b.purchase_on || b.first_due_on }));
      if (problem) throw fail(422, 'تحقّق من البيانات المُدخلة', 'VALIDATION_ERROR', problem);
      assertPlanTemplate(db, user, data);
      const at = nowIso();
      const p = Object.assign({ id: seq(db, 'plan'), household_id: user.household_id }, data, { created_by: user.id, created_at: at, updated_at: at });
      db.plans.push(p);
      insertItems(db, p.id, buildSchedule(p));
      const result = fullPlan(db, user, p);
      audit(db, user, 'installment.create', 'installment_plan', p.id, undefined, briefPlan(result));
      return created(result);
    }
    if ((m = /^\/installments\/(\d+)(?:\/items\/(\d+)(\/pay)?)?$/.exec(path))) {
      need('accounts.read', 'accounts.own');
      const p = visiblePlan(db, user, m[1]);
      const before = fullPlan(db, user, p);
      if (!m[2] && method === 'GET') return ok(before);
      need('transactions.write', 'accounts.own');
      const editable = (verb) => { if (!before.can_edit) throw fail(403, 'مينفعش ' + verb + ' خطّة التقسيط دي', 'FORBIDDEN'); };
      if (m[2]) {
        const item = before.items.find((i) => i.id === Number(m[2]));
        const raw = db.items.find((i) => i.id === Number(m[2]) && i.plan_id === p.id);
        if (m[3] && method === 'POST') {
          strict(b, ['occurred_on', 'account_id', 'note']);
          check({ occurred_on: V.date(b.occurred_on), account_id: V.id(b.account_id), note: V.text(b.note, { max: 500 }) });
          editable('تسدّد');
          if (!item || !raw) throw notFound('القسط غير موجود');
          if (raw.transaction_id) {
            const old = db.transactions.find((t) => t.id === raw.transaction_id);
            return ok({ item_id: item.id, already_paid: true, transaction: old && txVisible(db, user, old) ? presentTx(db, user, old) : null });
          }
          if (raw.settled_at) throw conflict('القسط ده متعلّم إنه اتدفع قبل كده', 'ALREADY_SETTLED');
          const label = item.seq === 0 ? 'المقدّم' : 'قسط ' + item.seq + ' من ' + p.installment_count;
          const t = createTx(db, user, {
            type: 'expense', account_id: b.account_id ? Number(b.account_id) : p.account_id, category_id: p.category_id, amount_minor: raw.amount_minor,
            occurred_on: b.occurred_on || todayIn(user.timezone), payee: p.payee || p.name,
            note: b.note !== undefined && optText(b.note) ? optText(b.note) : p.payee ? label + ' — ' + p.name : label,
          });
          raw.transaction_id = t.id;
          audit(db, user, 'transaction.create', 'transaction', t.id, undefined, briefTx(t));
          audit(db, user, 'installment.pay', 'installment_plan', p.id, undefined, { name: p.name, seq: item.seq, due_on: item.due_on, transaction_id: t.id, amount_minor: t.amount_minor });
          return created({ item_id: item.id, already_paid: false, transaction: presentTx(db, user, t) });
        }
        if (!m[3] && method === 'PATCH') {
          strict(b, ['settled']);
          check({ settled: typeof b.settled === 'boolean' ? null : 'الحقل مطلوب' });
          editable('تعدّل');
          if (!item || !raw) throw notFound('القسط غير موجود');
          if (item.status === 'paid') throw conflict('القسط ده متسجّل كعملية — احذف العملية لو عايز ترجّعه', 'ALREADY_PAID');
          if (b.settled) { raw.settled_at = raw.settled_at || nowIso(); raw.settled_by = user.id; } else { raw.settled_at = null; raw.settled_by = null; }
          audit(db, user, b.settled ? 'installment.settle' : 'installment.unsettle', 'installment_plan', p.id, undefined, { name: p.name, seq: item.seq, due_on: item.due_on, amount_minor: item.amount_minor });
          return ok(fullPlan(db, user, p));
        }
        return null;
      }
      if (method === 'PATCH') {
        strict(b, PLAN_FIELDS);
        validatePlan(b, false);
        editable('تعدّل');
        const merged = {};
        PLAN_FIELDS.forEach((f) => { merged[f] = b[f] !== undefined ? b[f] : before[f]; });
        merged.account_id = Number(merged.account_id);
        merged.category_id = Number(merged.category_id);
        assertPlanTemplate(db, user, merged);
        const reschedule = SCHEDULE_FIELDS.some((f) => b[f] !== undefined && b[f] !== before[f]);
        if (reschedule) {
          if (before.items.some((i) => i.paid)) throw conflict('فيه أقساط اتدفعت — مينفعش تغيّر المبلغ أو المواعيد. احذف الخطّة واعملها من جديد لو لازم.', 'PLAN_HAS_PAYMENTS');
          const problem = scheduleProblem(merged);
          if (problem) throw fail(422, problem[Object.keys(problem)[0]], 'VALIDATION_ERROR', problem);
        }
        PLAN_FIELDS.forEach((f) => { p[f] = f === 'payee' || f === 'note' ? optText(merged[f]) || null : merged[f]; });
        p.name = String(p.name).trim();
        p.updated_at = nowIso();
        if (reschedule) {
          db.items = db.items.filter((i) => i.plan_id !== p.id);
          insertItems(db, p.id, buildSchedule(p));
        }
        const after = fullPlan(db, user, p);
        audit(db, user, 'installment.update', 'installment_plan', p.id, briefPlan(before), briefPlan(after));
        return ok(after);
      }
      if (method === 'DELETE') {
        editable('تحذف');
        db.plans = db.plans.filter((x) => x.id !== p.id);
        db.items = db.items.filter((i) => i.plan_id !== p.id);
        audit(db, user, 'installment.delete', 'installment_plan', p.id, briefPlan(before));
        return noContent();
      }
    }

    /* --- المستحقّ --- */
    if (path === '/bills/due' && method === 'GET') {
      need('accounts.read', 'accounts.own');
      check({ from: V.date(q.from), to: V.date(q.to) });
      const today = todayIn(user.timezone);
      const range = { from: q.from || null, to: q.to || addDays(today, 30), today };
      const rec = ruleDueItems(db, user, range);
      const ins = planDueItems(db, user, range);
      const items = rec.items.concat(ins.items).sort((x, y) => x.due_on.localeCompare(y.due_on) || x.name.localeCompare(y.name, 'ar'));
      return ok({ today, from: range.from, to: range.to, items, sources: { recurring: rec.active, installments: ins.active } });
    }

    /* --- التقارير --- */
    if (path.indexOf('/reports/') === 0) need('reports.read');
    if (path === '/reports/summary' && method === 'GET') {
      if (q.month && !isValidMonth(q.month)) check({ month: 'الشهر لازم بصيغة YYYY-MM' });
      const period = resolvePeriod(user, q.month);
      const previous = periodRange(addMonths(period.month, -1), user.month_start_day);
      const totals = totalsBetween(db, user, period.from, period.to);
      const days = eachDay(period.from, period.to).map((d) => ({ date: d, income_minor: 0, expense_minor: 0 }));
      const byDay = new Map(days.map((d) => [d.date, d]));
      flows(db, user, period.from, period.to).forEach((t) => { byDay.get(t.occurred_on)[t.type + '_minor'] += t.amount_minor; });
      return ok({
        period,
        totals: Object.assign({}, totals, { savings_rate_bps: totals.income_minor > 0 ? ratioBps(totals.net_minor, totals.income_minor) : null }),
        previous: Object.assign({}, previous, totalsBetween(db, user, previous.from, previous.to)),
        by_category: byCategory(db, user, period.from, period.to),
        daily: days,
      });
    }
    if (path === '/reports/trend' && method === 'GET') {
      const months = q.months === undefined ? 6 : Number(q.months);
      check({ months: Number.isInteger(months) && months >= 2 && months <= 24 ? null : 'القيمة لازم تكون بين 2 و 24', end: q.end && !isValidMonth(q.end) ? 'الشهر لازم بصيغة YYYY-MM' : null });
      const endKey = q.end || resolvePeriod(user).month;
      const startKey = addMonths(endKey, -(months - 1));
      const buckets = new Map();
      for (let i = 0; i < months; i += 1) {
        const key = addMonths(startKey, i);
        buckets.set(key, Object.assign({}, periodRange(key, user.month_start_day), { income_minor: 0, expense_minor: 0 }));
      }
      flows(db, user, periodRange(startKey, user.month_start_day).from, periodRange(endKey, user.month_start_day).to).forEach((t) => {
        const bucket = buckets.get(periodOf(t.occurred_on, user.month_start_day));
        if (bucket) bucket[t.type + '_minor'] += t.amount_minor;
      });
      return ok(Array.from(buckets.values()).map((x) => Object.assign(x, { net_minor: x.income_minor - x.expense_minor })));
    }
    if (path === '/reports/net-worth' && method === 'GET') {
      const accounts = listAccounts(db, user, false).filter((a) => a.include_in_net_worth);
      const assets = sum(accounts.filter((a) => a.balance_minor > 0).map((a) => a.balance_minor));
      const liabilities = sum(accounts.filter((a) => a.balance_minor < 0).map((a) => -a.balance_minor));
      return ok({
        assets_minor: assets, liabilities_minor: liabilities, net_minor: assets - liabilities,
        accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, color: a.color, is_shared: a.is_shared, balance_minor: a.balance_minor })),
      });
    }

    /* --- سجل التغييرات --- */
    if (path === '/audit' && method === 'GET') {
      need('audit.read');
      check({ entity: V.oneOf(q.entity || undefined, ['household', 'user', 'account', 'category', 'transaction', 'budget', 'recurring_rule', 'installment_plan']) });
      const list = db.audit.filter((e) => e.household_id === user.household_id && (!q.entity || e.entity === q.entity) && (!q.user_id || e.user_id === Number(q.user_id)))
        .sort((x, y) => y.id - x.id);
      const p = pageOf(q);
      const rows = list.slice((p.page - 1) * p.size, p.page * p.size).map((e) => {
        const u = e.user_id ? findUser(db, e.user_id) : null;
        return { id: e.id, action: e.action, entity: e.entity, entity_id: e.entity_id, before_json: e.before_json, after_json: e.after_json, created_at: e.created_at, user_id: e.user_id, user_name: u ? u.full_name : null };
      });
      return paged(rows, pageMeta(p.page, p.size, list.length));
    }

    return null;
  }

  createDemo({
    key: 'masrofy_demo_db',
    version: 1,
    prefix: '/api/v1',
    seed,
    handle,
    notFound: () => ({ success: false, message: 'المسار ده مش موجود في النسخة التجريبية', code: 'NOT_FOUND' }),
    serverError: () => ({ success: false, message: 'حصل خطأ في النسخة التجريبية', code: 'DEMO_ERROR' }),
    home: '/',
    bar: {
      label: 'نسخة تجريبية',
      openFirst: true,
      intro: 'ده عرض لمصروفي ببيانات أسرة وهمية متخزنة على جهازك بس. ادخل بأي فرد وشوف كل واحد بيشوف إيه:',
      actions: [
        { label: 'ادخل كأحمد (صاحب الأسرة)', primary: true, run: (a) => { a.db().session = { userId: 1, familyId: uuid(), started_at: nowIso() }; a.go('/'); } },
        { label: 'ادخل كمنى (مشرفة)', run: (a) => { a.db().session = { userId: 2, familyId: uuid(), started_at: nowIso() }; a.go('/'); } },
        { label: 'ادخل كيوسف (الابن، جيبه بس)', run: (a) => { a.db().session = { userId: 4, familyId: uuid(), started_at: nowIso() }; a.go('/'); } },
      ],
      note: 'أو سجّل دخول بـ ahmed@masrofy.demo أو mona@masrofy.demo أو salma@masrofy.demo أو youssef@masrofy.demo وكلمة المرور ' + DEMO_PASSWORD + '. البريد مش بيتبعت فعلًا في النسخة دي.',
      // على الموبايل: فوق شريط التنقّل السفلي
      css: '@media (max-width:900px){#demo-bar{bottom:calc(76px + env(safe-area-inset-bottom))}}',
    },
  });
})();

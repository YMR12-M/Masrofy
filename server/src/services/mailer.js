/**
 * ═══════════════════════════════════════════════════════════════
 *  البريد
 *
 *  • في التطوير بلا SMTP_HOST: الرسالة تُطبع في اللوج (والرابط فيها)
 *    فتقدر تجرّب «نسيت كلمة المرور» بلا سيرفر بريد.
 *  • في الاختبارات: تُحفظ في `outbox` بالذاكرة ليقرأها الاختبار.
 *  • الإرسال لا يُسقط الطلب أبدًا: فشل البريد يُسجَّل ولا يكشف للمستخدم
 *    هل البريد مسجّل عندنا أم لا.
 * ═══════════════════════════════════════════════════════════════
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/** الرسائل المرسلة أثناء الاختبارات */
export const outbox = [];

let transport = null;
function getTransport() {
  transport ??= nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
  });
  return transport;
}

const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** قالب بسيط باتجاه RTL: فقرات + زر اختياري */
function render({ greeting, lines, action }) {
  const paragraphs = lines.map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#0d6b57;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none">${escapeHtml(action.label)}</a></p>`
    : '';
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.8;color:#1c2421">
    <p style="margin:0 0 12px">${escapeHtml(greeting)}</p>${paragraphs}${button}
    <p style="margin:24px 0 0;color:#5b6661;font-size:13px">— مصروفي</p></div>`;
  const text = [greeting, ...lines, action ? `${action.label}: ${action.url}` : '', '— مصروفي'].filter(Boolean).join('\n\n');
  return { html, text };
}

const TEMPLATES = {
  password_reset: ({ name, link }) => ({
    subject: 'استعادة كلمة المرور — مصروفي',
    ...render({
      greeting: `أهلًا ${name}،`,
      lines: ['وصلنا طلب لتغيير كلمة مرور حسابك. الرابط صالح لمدّة ساعة واحدة.', 'لو مش إنت اللي طلبت، تجاهل الرسالة دي وحسابك في أمان.'],
      action: { label: 'اختيار كلمة مرور جديدة', url: link },
    }),
  }),
};

export async function sendMail({ to, template, payload }) {
  const message = { from: env.mail.from, to, ...TEMPLATES[template](payload) };

  if (env.isTest) {
    outbox.push({ to, template, payload, subject: message.subject });
    return;
  }
  if (env.mail.disabled) return;
  if (!env.mail.host) {
    logger.info(`📧 (بلا SMTP) إلى ${to} — ${message.subject}\n${message.text}`);
    return;
  }
  try {
    await getTransport().sendMail(message);
  } catch (error) {
    logger.error(`تعذّر إرسال البريد إلى ${to}: ${error.message}`);
  }
}

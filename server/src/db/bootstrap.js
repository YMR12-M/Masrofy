/**
 * ═══════════════════════════════════════════════════════════════
 *  تهيئة أوّل تشغيل — لا بيانات تجريبية
 *
 *  للنشر الخاص بأسرة واحدة (ALLOW_SIGNUP=false) حيث لا توجد شاشة
 *  «حساب جديد». ينشئ الأسرة وحساب صاحبها والتصنيفات المقترحة — نفس ما
 *  تفعله شاشة التسجيل بالظبط (createHouseholdWithOwner). لا حسابات ولا عمليات.
 *
 *  آمن للتكرار: لو فيه صاحب أسرة بالفعل يخبرك ويخرج. ولإنشاء أسرة إضافية
 *  صراحةً: --new-household
 *
 *  التشغيل:   npm run db:bootstrap
 *  القيم من server/.env (HOUSEHOLD_NAME / ADMIN_*) أو وسائط:
 *    npm run db:bootstrap -- --household="بيت العيلة" --name="اسمك" \
 *      --email=you@example.com --password='كلمة-قوية-طويلة'
 * ═══════════════════════════════════════════════════════════════
 */
import { closePool, queryOne, transaction } from '../config/db.js';
import { hashPassword, passwordIssues } from '../utils/security.js';
import { logger } from '../utils/logger.js';
import { createHouseholdWithOwner } from '../modules/household/household.service.js';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split('=');
      return [key.replace(/-/g, '_'), rest.length ? rest.join('=') : 'true'];
    }),
);

const pick = (key, envKey) => String(args[key] || process.env[envKey] || '').trim();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function bootstrap() {
  const existingOwner = await queryOne("SELECT id, email FROM users WHERE role = 'owner' AND deleted_at IS NULL LIMIT 1");
  if (existingOwner && args.new_household !== 'true') {
    logger.info(`فيه صاحب أسرة بالفعل (${existingOwner.email}) — مفيش حاجة اتعملت.`);
    logger.info('لإضافة أفراد: من التطبيق › الأسرة. ولإنشاء أسرة إضافية: --new-household');
    return;
  }

  const householdName = pick('household', 'HOUSEHOLD_NAME');
  const fullName = pick('name', 'ADMIN_NAME');
  const email = pick('email', 'ADMIN_EMAIL').toLowerCase();
  const password = pick('password', 'ADMIN_PASSWORD');

  const missing = [];
  if (!householdName) missing.push('HOUSEHOLD_NAME (أو --household=)  اسم الأسرة');
  if (!fullName) missing.push('ADMIN_NAME (أو --name=)');
  if (!email) missing.push('ADMIN_EMAIL (أو --email=)');
  if (!password) missing.push('ADMIN_PASSWORD (أو --password=)');

  if (missing.length > 0) {
    logger.warn('اتوقّف — البيانات دي ناقصة:');
    missing.forEach((item) => console.log(`     ✗ ${item}`));
    console.log(`
  املأها في server/.env ثم أعد التشغيل، أو مرّرها مباشرة:

    npm run db:bootstrap -- \\
      --household="بيت العيلة" --name="اسمك" --email="you@example.com" \\
      --password='كلمة-مرور-قوية-وطويلة'

  وبعد النجاح احذف ADMIN_PASSWORD من .env.
`);
    process.exitCode = 1;
    return;
  }

  if (!EMAIL_RE.test(email)) throw new Error(`بريد غير صالح: ${email}`);
  const issues = passwordIssues(password);
  if (issues.length > 0) throw new Error(`كلمة المرور ضعيفة — لازم:\n     • ${issues.join('\n     • ')}`);
  if (await queryOne('SELECT id FROM users WHERE email = ?', [email])) throw new Error(`البريد ${email} مستخدم بالفعل`);

  const passwordHash = await hashPassword(password);
  const { householdId, userId } = await transaction((tx) => createHouseholdWithOwner(tx, {
    householdName, fullName, email, passwordHash,
  }));

  logger.success(`اتنشأت الأسرة «${householdName}» (#${householdId}) وحساب صاحبها ${email} (#${userId})`);
  console.log('\n  الخطوة الجاية: شغّل السيرفر والواجهة وادخل بالبريد ده، وابدأ بإضافة حساباتك.\n');
}

try {
  await bootstrap();
} catch (error) {
  logger.error(error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}

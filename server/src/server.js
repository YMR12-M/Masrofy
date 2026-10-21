/**
 * نقطة الإقلاع: فحص القاعدة ← تشغيل HTTP ← إيقاف نظيف.
 */
import { env } from './config/env.js';
import { assertDatabaseConnection, closePool } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { startAutoPostJob } from './modules/recurring/recurring.job.js';

if (!(await assertDatabaseConnection())) {
  logger.error('السيرفر لن يعمل بدون قاعدة البيانات. تأكد إن MySQL شغّال وأن DB_* في .env صحيحة، ثم: npm run db:setup');
  process.exit(1);
}

const app = createApp();
const server = app.listen(env.port, () => {
  logger.success(`مصروفي API شغّال على http://localhost:${env.port}${env.apiPrefix}  (${env.nodeEnv})`);
});

// الفواتير التلقائية: دورة عند الإقلاع ثم كل AUTO_POST_INTERVAL_MINUTES
const stopAutoPost = env.autoPost.enabled ? startAutoPostJob(env.autoPost) : () => {};

/** إيقاف نظيف: نكمل الطلبات الجارية ثم نغلق الاتصالات (Render/Docker يرسلان SIGTERM) */
let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info(`${signal} — إيقاف نظيف...`);
  stopAutoPost();
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  // لو فيه اتصال معلّق، لا ننتظر للأبد
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error(`unhandledRejection: ${reason instanceof Error ? reason.stack : reason}`);
});

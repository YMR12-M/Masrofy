/**
 * مهمة التسجيل التلقائي: كل فترة تسجّل المواعيد التلقائية اللي جه معادها.
 *
 * بسيطة عمدًا (setInterval داخل نفس العملية): الدالة نفسها idempotent ومحمية
 * بقفل وقيد فريد في القاعدة، فلو اشتغل سيرفران معًا أو اتأخّرت دورة لا يتكرّر
 * شيء. تُشغَّل من server.js فقط لو AUTO_POST_ENABLED (مقفولة في الاختبارات).
 */
import { logger } from '../../utils/logger.js';
import { recurringService } from './recurring.service.js';

/** يبدأ المهمة (دورة فورية ثم كل intervalMinutes) ويعيد دالة الإيقاف */
export function startAutoPostJob({ intervalMinutes }) {
  let running = false;

  const tick = async () => {
    if (running) return; // الدورة السابقة لسه شغّالة
    running = true;
    try {
      const { posted, failed } = await recurringService.postDueAuto();
      if (posted > 0 || failed > 0) logger.info(`التسجيل التلقائي: ${posted} اتسجّلت، ${failed} اتعطّلت`);
    } catch (error) {
      logger.error(`التسجيل التلقائي فشل: ${error.message}`);
    } finally {
      running = false;
    }
  };

  tick();
  const timer = setInterval(tick, intervalMinutes * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

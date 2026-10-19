import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * إعداد Vite لواجهة الويب.
 *
 * المنافذ: 5190 للتطوير و4190 للمعاينة (تطبيق الموبايل المخطّط 5191 — بجواره بلا تصادم).
 * `strictPort` مقصود: لو المنفذ مشغول الأفضل أن يفشل بصوت عالٍ من أن ينتقل بصمت
 * لمنفذ آخر فيفتح أحدهم الرابط القديم ويرى تطبيقًا مختلفًا.
 *
 * البروكسي يوجّه /api للسيرفر (4020) ويحذف ترويسة Origin: لو فتحت الواجهة من
 * جوّال على نفس الشبكة يتغيّر الأصل فترفضه قائمة CORS. الحذف يجعل الطلب «من
 * الأصل نفسه». هذا للتطوير وحده.
 */
const API_TARGET = process.env.MASROFY_API_TARGET || 'http://localhost:4020';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5190,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
  preview: { port: 4190, strictPort: true },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    globals: true,
  },
});

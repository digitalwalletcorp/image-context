import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  test: {
    // canvasによる描画・エンコードを実際に検証するため、実ブラウザで実行する
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      screenshotFailures: false,
      instances: [
        { browser: 'chromium' }
      ]
    },
    include: [
      'test/specs/**/*.spec.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: [
        'lcov',
        'text-summary'
      ],
      reportsDirectory: 'test/coverage',
      include: [
        'src/**'
      ]
    }
  }
});

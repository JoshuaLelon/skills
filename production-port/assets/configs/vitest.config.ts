import { defineConfig } from 'vitest/config'

// Projects split by ENVIRONMENT NEED, not folder aesthetics. jsdom is banned
// (config-traps enforces it): component tests belong in real Chromium.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      // Component project — enable when the first *.test.tsx lands:
      //   npm i -D @vitest/browser-playwright
      // {
      //   test: {
      //     name: 'component',
      //     include: ['src/**/*.test.tsx'],
      //     browser: {
      //       enabled: true,
      //       provider: playwright(),   // import { playwright } from '@vitest/browser-playwright'
      //       instances: [{ browser: 'chromium' }],
      //     },
      //   },
      // },
    ],
  },
})

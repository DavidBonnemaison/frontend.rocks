import { test as base, expect } from '@playwright/test';

// Third-party scripts are never loaded in tests. They are answered with an empty script rather
// than aborted: an aborted request logs a console error, and many specs assert there are none.
const THIRD_PARTY = [
  'https://gc.zgo.at/**',
  'https://*.goatcounter.com/**',
];

export const test = base.extend({
  page: async ({ page }, provide) => {
    for (const pattern of THIRD_PARTY) {
      await page.route(pattern, (route) =>
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
          body: '/* stub */',
        }),
      );
    }
    await provide(page);
  },
});
export { expect };

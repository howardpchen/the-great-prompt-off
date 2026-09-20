import { expect, test } from '@playwright/test';

// Read-only, unauthenticated checks: never submit credentials or model requests.
test('dark first paint, readable organizer login and visible keyboard focus', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  for (const path of ['/', '/admin']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe('dark');
    const colors = await page.locator('h1').first().evaluate(el => {
      const rgba = (color: string) => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      };
      const luminance = (c: number[]) => c.slice(0, 3).map(v => {
        v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const fg = luminance(rgba(getComputedStyle(el).color));
      let ancestor: Element | null = el;
      while (ancestor) {
        const bg = rgba(getComputedStyle(ancestor).backgroundColor);
        if (bg[3] === 255) {
          const l = luminance(bg);
          return { background: l, ratio: (Math.max(fg, l) + .05) / (Math.min(fg, l) + .05) };
        }
        ancestor = ancestor.parentElement;
      }
      throw new Error('No opaque theme surface');
    });
    expect(colors.background).toBeLessThan(.1);
    expect(colors.ratio).toBeGreaterThanOrEqual(4.5);
  }
  const secret = page.getByLabel('Admin secret', { exact: true });
  await secret.focus();
  expect(await secret.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({width, height:900});
    await expect(secret).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

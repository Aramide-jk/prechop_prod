import { test, expect } from '@playwright/test';

test('closed windows offer the next day and the mobile menu stays prominent', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-30T16:00:00+01:00'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const hero = await page.locator('.hero').boundingBox();
  expect(hero!.height).toBeLessThan(240);
  const menu = await page.locator('.section-heading').boundingBox();
  expect(menu!.y).toBeLessThan(450);
  for (const window of ['Breakfast', 'Lunch', 'Dinner']) {
    await page.locator('.date-strip button').first().click();
    await page.getByRole('button', { name: window, exact: true }).click();
    await expect(page.locator('.cutoff-notice')).toBeVisible();
    await expect(page.locator('.meal-card')).toHaveCount(0);
    await page.getByRole('button', { name: `Book tomorrow’s ${window.toLowerCase()}` }).click();
    await expect(page.locator('.date-strip button').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: window, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.meal-card')).toHaveCount(3);
  }
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Wallet' }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Menu', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('banner')).toBeVisible();
  await page.screenshot({ path: 'test-results/mealhr-compact-menu.png', fullPage: true });
});

test('breakfast stays available until the later batch closes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-30T07:00:00+01:00'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Breakfast', exact: true }).click();
  await expect(page.locator('.meal-card')).toHaveCount(3);
  await page.clock.setFixedTime(new Date('2026-09-30T08:00:00+01:00'));
  await expect(page.locator('.cutoff-notice')).toBeVisible();
});

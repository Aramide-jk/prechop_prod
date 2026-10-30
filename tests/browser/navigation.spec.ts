import { test, expect } from '@playwright/test';

test('customer navigation is consistent and highlights each route', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const desktop = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  for (const label of ['Orders', 'Wallet', 'Account', 'Menu']) {
    await desktop.getByRole('link', { name: label, exact: true }).click();
    await expect(desktop.locator('[aria-current="page"]')).toHaveText(label);
    await expect(desktop.getByRole('link')).toHaveCount(4);
    await expect(page.locator('header')).toHaveCount(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  for (const label of ['Orders', 'Wallet', 'Account', 'Menu']) {
    await mobile.getByRole('link', { name: label, exact: true }).click();
    await expect(mobile.locator('[aria-current="page"]')).toHaveText(label);
    await expect(desktop).not.toBeVisible();
  }
  await page.goto('/checkout');
  await expect(mobile).toBeVisible();
  await expect(mobile.locator('[aria-current="page"]')).toHaveCount(0);
});

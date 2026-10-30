import { test, expect } from '@playwright/test';

test('account edits and address management preserve a valid default', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account.' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit name' }).click();
  await page.getByLabel('Your name').fill('Amina Bello');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.locator('.account-profile')).toContainText('Amina Bello');
  await page.getByRole('button', { name: 'Change phone number' }).click();
  await page.getByLabel('New phone number').fill('08123456789');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Verification code').fill('000000');
  await page.getByRole('button', { name: 'Verify preview code' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('123456');
  await page.getByLabel('Verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify preview code' }).click();
  await expect(page.locator('.account-profile')).toContainText('08123456789');
  await page.getByRole('button', { name: 'Add address', exact: true }).click();
  await page.getByLabel('Address label').fill('Hostel');
  await page.getByLabel('Delivery area', { exact: true }).selectOption('abu');
  await page.getByLabel('Address & landmark').fill('Queen Amina Hall, reception');
  await page.getByRole('button', { name: 'Save address', exact: true }).click();
  await expect(page.locator('.address-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Make Hostel default' }).click();
  await expect(page.locator('.address-card').filter({ has: page.getByRole('heading', { name: 'Hostel', exact: true }) })).toContainText('Default');
  await page.getByRole('button', { name: 'Edit Hostel', exact: true }).click();
  await page.getByLabel('Address & landmark').fill('Queen Amina Hall, side gate');
  await page.getByRole('button', { name: 'Save address', exact: true }).click();
  await expect(page.locator('.address-card')).toContainText(['main entrance', 'market road', 'side gate']);
  await page.screenshot({ path: 'test-results/mealhr-account-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mealhr-account-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Delete Hostel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep address', exact: true }).click();
  await expect(page.locator('.address-card')).toHaveCount(3);
  for (const label of ['Hostel', 'Department', 'Home']) {
    await page.getByRole('button', { name: `Delete ${label}`, exact: true }).click();
    await page.getByRole('button', { name: 'Delete address', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Where should we bring your meals?' })).toBeVisible();
});

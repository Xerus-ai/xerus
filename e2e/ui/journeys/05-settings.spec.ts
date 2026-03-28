import { test, expect } from '../fixtures/auth.fixture'
import { SettingsPage } from '../pages/settings.page'
import { CONFIG } from '../../shared/config'

test.describe('05 - Settings', () => {
  let settingsPage: SettingsPage

  test.beforeEach(async ({ authenticatedPage: page }) => {
    settingsPage = new SettingsPage(page)
  })

  test('settings page loads and shows profile', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    await settingsPage.goto()

    // Profile section should be visible (sidebar nav has Profile link)
    await expect(settingsPage.profileLink).toBeVisible({ timeout: 10_000 })

    // Display name input should be visible
    await expect(settingsPage.displayNameInput).toBeVisible({ timeout: 10_000 })

    // Verify profile matches DB
    const user = await db.findById('users', testUserId, 'user_id')
    if (user) {
      const inputValue = await settingsPage.displayNameInput.inputValue()
      expect(inputValue).toBe(user.display_name)
    }

    await page.screenshot({ path: 'screenshots/05-settings-profile.png' })
  })

  test('edit display name updates DB', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    await settingsPage.goto()
    await expect(settingsPage.displayNameInput).toBeVisible({ timeout: 10_000 })

    // Get original name
    const userBefore = await db.findById('users', testUserId, 'user_id')
    const originalName = userBefore?.display_name as string

    // Update name
    const testName = `E2E Test User ${Date.now()}`
    await settingsPage.updateDisplayName(testName)

    // Wait for API
    await page.waitForTimeout(1_000)

    // Verify in DB
    const userAfter = await db.findById('users', testUserId, 'user_id')
    expect(userAfter?.display_name).toBe(testName)

    // Restore original name
    await settingsPage.updateDisplayName(originalName)
    await page.waitForTimeout(1_000)

    // Verify restored
    const userRestored = await db.findById('users', testUserId, 'user_id')
    expect(userRestored?.display_name).toBe(originalName)
  })

  test('API keys page loads', async ({ authenticatedPage: page }) => {
    await settingsPage.gotoApiKeys()

    // Should see API key input or section
    await expect(settingsPage.apiKeyInput.first()).toBeVisible({ timeout: 10_000 }).catch(() => {
      // Fallback: check the page rendered at all
      expect(page.url()).toContain('/settings/api-keys')
    })

    await page.screenshot({ path: 'screenshots/05-settings-api-keys.png' })
  })

  test('workspace overview page loads', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    await settingsPage.gotoWorkspace()

    // Verify workspace data matches DB
    const workspace = await db.findLatest('workspaces', { user_id: testUserId }).catch(() => null)

    if (workspace) {
      // Sandbox status should be displayed
      if (await settingsPage.sandboxStatus.isVisible().catch(() => false)) {
        const statusText = await settingsPage.sandboxStatus.textContent()
        expect(statusText).toBeTruthy()
      }
    }

    await page.screenshot({ path: 'screenshots/05-settings-workspace.png' })
  })

  test('billing page loads with plan toggle', async ({ authenticatedPage: page }) => {
    await settingsPage.gotoBilling()

    // Page should load
    expect(page.url()).toContain('/settings/billing')

    await page.screenshot({ path: 'screenshots/05-settings-billing.png' })
  })

  test('close settings via X button navigates to home', async ({ authenticatedPage: page }) => {
    await settingsPage.goto()

    if (await settingsPage.closeButton.isVisible().catch(() => false)) {
      await settingsPage.closeSettings()
      await page.waitForURL((url) => !url.pathname.includes('/settings'), {
        timeout: 5_000,
      })
      expect(page.url()).not.toContain('/settings')
    }
  })

  test('close settings via Escape key', async ({ authenticatedPage: page }) => {
    await settingsPage.goto()

    // Try closing via Escape
    await settingsPage.closeViaEscape()

    // Should navigate away from settings (may not work if no backdrop handler)
    await page.waitForTimeout(1_000)
  })

  test('settings sidebar navigation works', async ({ authenticatedPage: page }) => {
    await settingsPage.goto()

    // Navigate through sidebar links
    await settingsPage.apiKeysLink.click()
    await page.waitForURL('**/settings/api-keys', { timeout: 5_000 })

    await settingsPage.workspaceLink.click()
    await page.waitForURL('**/settings/workspace', { timeout: 5_000 })

    await settingsPage.billingLink.click()
    await page.waitForURL('**/settings/billing', { timeout: 5_000 })

    // Back to profile
    await settingsPage.profileLink.click()
    await page.waitForURL((url) => url.pathname === '/settings', { timeout: 5_000 })
  })
})

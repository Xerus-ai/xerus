import { type Page, type Locator } from '@playwright/test'
import { waitForAuthSettled } from '../../shared/page-helpers'

export class SettingsPage {
  // Layout
  readonly settingsPanel: Locator
  readonly closeButton: Locator
  readonly backdrop: Locator

  // Sidebar navigation
  readonly profileLink: Locator
  readonly apiKeysLink: Locator
  readonly workspaceLink: Locator
  readonly dataLink: Locator
  readonly billingLink: Locator
  readonly signOutButton: Locator

  // Profile page
  readonly displayNameInput: Locator
  readonly saveProfileButton: Locator

  // API Keys page
  readonly apiKeyInput: Locator
  readonly saveKeyButton: Locator

  // Workspace overview
  readonly sandboxStatus: Locator

  constructor(private page: Page) {
    // Layout
    this.settingsPanel = page.locator('[data-testid="settings-panel"]')
    this.closeButton = page.locator('[data-testid="settings-close"]')
    this.backdrop = page.locator('[data-testid="settings-backdrop"]')

    // Sidebar nav — the desktop sidebar lives inside an <aside> element while
    // the mobile nav uses a <nav role="tablist">. Target the desktop <aside> to
    // avoid strict-mode violations when both are in the DOM.
    const desktopNav = page.locator('aside nav[aria-label="Settings navigation"]')
    this.profileLink = desktopNav.locator('a[href="/settings"]')
    this.apiKeysLink = desktopNav.locator('a[href="/settings/api-keys"]')
    this.workspaceLink = desktopNav.locator('a[href="/settings/workspace"]')
    this.dataLink = desktopNav.locator('a[href="/settings/data"]')
    this.billingLink = desktopNav.locator('a[href="/settings/billing"]')
    this.signOutButton = page.locator('[data-testid="settings-sign-out"]')

    // Profile
    this.displayNameInput = page.locator('[data-testid="display-name-input"]')
    this.saveProfileButton = page.locator('[data-testid="save-profile-button"]')

    // API Keys
    this.apiKeyInput = page.locator('[data-testid="api-key-input"]')
    this.saveKeyButton = page.locator('[data-testid="save-key-button"]')

    // Workspace
    this.sandboxStatus = page.locator('[data-testid="sandbox-status"]')
  }

  async goto() {
    await this.page.goto('/settings', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForAuthSettled(this.page)
    await this.page.waitForLoadState('domcontentloaded')
  }

  async gotoApiKeys() {
    await this.page.goto('/settings/api-keys', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForAuthSettled(this.page)
    await this.page.waitForLoadState('domcontentloaded')
  }

  async gotoWorkspace() {
    await this.page.goto('/settings/workspace', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForAuthSettled(this.page)
    await this.page.waitForLoadState('domcontentloaded')
  }

  async gotoBilling() {
    await this.page.goto('/settings/billing', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForAuthSettled(this.page)
    await this.page.waitForLoadState('domcontentloaded')
  }

  async updateDisplayName(name: string) {
    await this.displayNameInput.clear()
    await this.displayNameInput.fill(name)
    await this.saveProfileButton.click()
  }

  async closeSettings() {
    await this.closeButton.click()
  }

  async closeViaEscape() {
    await this.page.keyboard.press('Escape')
  }
}

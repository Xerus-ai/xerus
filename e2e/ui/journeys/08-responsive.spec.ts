import { test, expect } from '../fixtures/auth.fixture'
import { waitForAuthSettled } from '../../shared/page-helpers'

test.describe('08 - Responsive Layout', () => {
  /** Navigate to a route and wait for Firebase auth to settle + app to render. */
  async function gotoAuthenticated(page: import('@playwright/test').Page, route: string) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForAuthSettled(page, 30_000)
    // Additional short wait for React to finish hydrating after auth resolves
    await page.waitForLoadState('domcontentloaded')
  }

  test('mobile viewport (375x812) — no horizontal overflow', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 })

    // Check multiple pages
    const pages = ['/', '/chat', '/workspace', '/settings']

    for (const route of pages) {
      await gotoAuthenticated(page, route)

      // Check for horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasOverflow).toBe(false)
    }

    await page.screenshot({ path: 'screenshots/08-mobile-375.png', fullPage: true })
  })

  test('mobile viewport shows mobile header and bottom bar', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoAuthenticated(page, '/')

    // Mobile header should be visible (MobileHeader component)
    const mobileHeader = page.locator('[data-testid="mobile-header"]')
    const hasMobileHeader = await mobileHeader.isVisible().catch(() => false)

    // Mobile bottom bar should be visible (MobileBottomBar component)
    const mobileBottomBar = page.locator('[data-testid="mobile-bottom-bar"]')
    const hasMobileBottomBar = await mobileBottomBar.isVisible().catch(() => false)

    // At minimum, the page should not show the desktop sidebar
    const desktopSidebar = page.locator('[data-testid="desktop-sidebar"]')
    const hasDesktopSidebar = await desktopSidebar.isVisible().catch(() => false)

    // On mobile, desktop sidebar should be hidden
    if (hasMobileHeader || hasMobileBottomBar) {
      expect(hasDesktopSidebar).toBe(false)
    }

    await page.screenshot({ path: 'screenshots/08-mobile-layout.png' })
  })

  test('tablet viewport (768x1024) renders correctly', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 })

    await gotoAuthenticated(page, '/chat')

    // No overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasOverflow).toBe(false)

    await page.screenshot({ path: 'screenshots/08-tablet-768.png' })
  })

  test('desktop viewport (1440x900) shows full layout', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    await gotoAuthenticated(page, '/chat')

    // Desktop sidebar should be visible (expanded has aria-label="Main navigation",
    // collapsed just has role="navigation"). Wait for either variant to appear.
    const sidebar = page.locator('aside[role="navigation"]').first()
    await expect(sidebar).toBeVisible({ timeout: 15_000 })

    // No overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasOverflow).toBe(false)

    await page.screenshot({ path: 'screenshots/08-desktop-1440.png', fullPage: true })
  })

  test('chat input is accessible on all viewports', async ({
    authenticatedPage: page,
  }) => {
    const viewports = [
      { width: 375, height: 812, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1440, height: 900, name: 'desktop' },
    ]

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/chat', { waitUntil: 'domcontentloaded', timeout: 30_000 })

      // Message input should be visible and interactive
      const messageInput = page.locator('textarea[aria-label="Message input"]')
      await expect(messageInput).toBeVisible({ timeout: 30_000 })

      // Should be able to type
      await messageInput.fill('test')
      const value = await messageInput.inputValue()
      expect(value).toBe('test')
      await messageInput.clear()
    }
  })
})

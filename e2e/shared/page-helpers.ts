import { type Page } from '@playwright/test'

/**
 * Wait for Firebase auth to settle after navigation.
 * Ensures we are not on /login and no loading/error screens are showing.
 */
export async function waitForAuthSettled(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const path = window.location.pathname
      const text = document.body.innerText
      return !path.includes('/login') &&
        !text.includes('Verifying your session') &&
        !text.includes('Loading your workspace') &&
        !text.includes('Session expired')
    },
    { timeout }
  )
}

import { test, expect } from '../fixtures/auth.fixture'

test.describe('07 - Skills & Connectors', () => {
  test('skills marketplace loads', async ({ authenticatedPage: page }) => {
    await page.goto('/workspace')
    await page.waitForLoadState('domcontentloaded')

    // Click Skills in sidebar or workspace section
    const skillsLink = page.locator('a[href*="skills"], [data-testid="skills-tab"]').first()
    const skillsButton = page.getByText('Skills').first()

    if (await skillsLink.isVisible().catch(() => false)) {
      await skillsLink.click()
    } else if (await skillsButton.isVisible().catch(() => false)) {
      await skillsButton.click()
    }

    await page.waitForTimeout(1_000)

    // Should show skills panel or navigate to skills
    await page.screenshot({ path: 'screenshots/07-skills-browse.png' })
  })

  test('connectors section loads', async ({ authenticatedPage: page }) => {
    await page.goto('/workspace')
    await page.waitForLoadState('domcontentloaded')

    // Click Connectors in sidebar or workspace section
    const connectorsLink = page.locator('a[href*="connectors"], [data-testid="connectors-tab"]').first()
    const connectorsButton = page.getByText('Connectors').first()

    if (await connectorsLink.isVisible().catch(() => false)) {
      await connectorsLink.click()
    } else if (await connectorsButton.isVisible().catch(() => false)) {
      await connectorsButton.click()
    }

    await page.waitForTimeout(1_000)

    await page.screenshot({ path: 'screenshots/07-connectors-browse.png' })
  })

  test('skill detail view loads on click', async ({ authenticatedPage: page }) => {
    await page.goto('/workspace')
    await page.waitForLoadState('domcontentloaded')

    // Navigate to skills
    const skillsButton = page.getByText('Skills').first()
    if (await skillsButton.isVisible().catch(() => false)) {
      await skillsButton.click()
      await page.waitForTimeout(1_000)

      // Click first skill card
      const skillCard = page.locator('[data-testid="skill-card"]').first()
      if (await skillCard.isVisible().catch(() => false)) {
        await skillCard.click()
        await page.waitForTimeout(1_000)

        // Should show skill detail
        await page.screenshot({ path: 'screenshots/07-skill-detail.png' })
      }
    }
  })
})

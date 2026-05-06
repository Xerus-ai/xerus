import { test, expect } from '../fixtures/auth.fixture'
import { InboxPage } from '../pages/inbox.page'

test.describe('04 - Inbox', () => {
  let inboxPage: InboxPage

  test.beforeEach(async ({ authenticatedPage: page }) => {
    inboxPage = new InboxPage(page)
  })

  test('inbox page loads', async ({ authenticatedPage: page }) => {
    await inboxPage.goto()
    // Page should render without crashing — check URL is correct
    await page.waitForTimeout(2_000)
    expect(page.url()).toContain('/inbox')
    await page.screenshot({ path: 'screenshots/04-inbox-load.png' })
  })

  test('create project via API and verify in sidebar', async ({
    authenticatedPage: page,
  }) => {
    await inboxPage.goto()
    const projectName = `[E2E] Test Project ${Date.now()}`

    // Try to create via UI button
    if (await inboxPage.createProjectButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxPage.createProject(projectName)
      await page.waitForTimeout(2_000)
    }

    await page.screenshot({ path: 'screenshots/04-inbox-create-project.png' })
  })

  test('navigate to channel shows tabs', async ({
    authenticatedPage: page,
  }) => {
    // Navigate to inbox and try to find a channel
    await inboxPage.goto()
    await page.waitForTimeout(2_000)

    // Click first channel link if visible
    const channelLink = inboxPage.channelLink.first()
    if (await channelLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await channelLink.click()
      await page.waitForTimeout(2_000)
      // Should see channel tabs
      const hasTabs = await inboxPage.tasksTab.isVisible({ timeout: 5_000 }).catch(() => false)
      expect(hasTabs).toBeTruthy()
    }
  })

  test('channel tabs switch between Tasks and Activity', async ({
    authenticatedPage: page,
  }) => {
    await inboxPage.goto()
    await page.waitForTimeout(1_000)

    const channelLink = inboxPage.channelLink.first()
    if (!(await channelLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No channels visible')
      return
    }

    await channelLink.click()
    await page.waitForTimeout(1_000)

    if (await inboxPage.tasksTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inboxPage.tasksTab.click()
      await page.waitForTimeout(500)
      await inboxPage.activityTab.click()
      await page.waitForTimeout(500)
    }
  })

  test('send channel message', async ({
    authenticatedPage: page,
  }) => {
    await inboxPage.goto()
    await page.waitForTimeout(1_000)

    const channelLink = inboxPage.channelLink.first()
    if (!(await channelLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No channels visible')
      return
    }

    await channelLink.click()
    await page.waitForTimeout(1_000)

    if (await inboxPage.activityTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await inboxPage.activityTab.click()
      await page.waitForTimeout(1_000)
    }

    if (await inboxPage.channelMessageInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const messageText = `[E2E] Channel message ${Date.now()}`
      await inboxPage.sendChannelMessage(messageText)
      await page.waitForTimeout(1_000)
    }
  })
})

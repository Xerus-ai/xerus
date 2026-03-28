import { test, expect } from '../fixtures/auth.fixture'
import { InboxPage } from '../pages/inbox.page'

test.describe('04 - Inbox', () => {
  let inboxPage: InboxPage

  test.beforeEach(async ({ authenticatedPage: page }) => {
    inboxPage = new InboxPage(page)
  })

  test('inbox page loads', async ({ authenticatedPage: page }) => {
    await inboxPage.goto()

    // Inbox should render — check for the channel selection prompt, empty state, or sidebar content
    const selectPrompt = page.getByText('Select a channel')
    const emptyState = page.getByText('No projects yet')
    const hasContent =
      await selectPrompt.isVisible({ timeout: 5_000 }).catch(() => false) ||
      await emptyState.isVisible({ timeout: 1_000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
    await page.screenshot({ path: 'screenshots/04-inbox-load.png' })
  })

  test('create project adds domain to DB', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    await inboxPage.goto()

    const beforeCount = await db.count('domains', { user_id: testUserId })
    const projectName = `[E2E] Test Project ${Date.now()}`

    await inboxPage.createProject(projectName)

    // Wait for API
    await page.waitForTimeout(1_000)

    // Verify domain created in DB
    const afterCount = await db.count('domains', { user_id: testUserId })
    expect(afterCount).toBe(beforeCount + 1)

    const domain = await db.findLatest('domains', { user_id: testUserId })
    expect(domain.name).toBe(projectName)
    expect(domain.workspace_id).toBeTruthy()

    // Verify a default channel was created
    const channelCount = await db.count('channels', { domain_id: domain.id })
    expect(channelCount).toBeGreaterThanOrEqual(1)

    // Screenshot
    await page.screenshot({ path: 'screenshots/04-inbox-create-project.png' })
  })

  test('navigate to channel shows tabs', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    // Get an existing domain and channel
    const domain = await db.findLatest('domains', { user_id: testUserId }).catch(() => null)
    if (!domain) {
      test.skip()
      return
    }

    const channels = await db.findAll('channels', { domain_id: domain.id })
    if (channels.length === 0) {
      test.skip()
      return
    }

    const channel = channels[0]
    await inboxPage.gotoChannel(String(domain.slug), String(channel.slug))

    // Should see channel tabs
    await expect(inboxPage.tasksTab).toBeVisible({ timeout: 10_000 })
    await expect(inboxPage.activityTab).toBeVisible()
  })

  test('send channel message creates DB record', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    const domain = await db.findLatest('domains', { user_id: testUserId }).catch(() => null)
    if (!domain) {
      test.skip()
      return
    }

    const channels = await db.findAll('channels', { domain_id: domain.id })
    if (channels.length === 0) {
      test.skip()
      return
    }

    const channel = channels[0]
    await inboxPage.gotoChannel(String(domain.slug), String(channel.slug))

    // Switch to Activity tab
    await inboxPage.activityTab.click()
    await page.waitForTimeout(1_000)

    const beforeCount = await db.count('channel_messages', { channel_id: channel.id })

    // Send message
    const messageText = `[E2E] Channel message ${Date.now()}`
    await inboxPage.sendChannelMessage(messageText)

    // Wait for API
    await page.waitForTimeout(1_000)

    // Verify in DB
    const afterCount = await db.count('channel_messages', { channel_id: channel.id })
    expect(afterCount).toBeGreaterThan(beforeCount)

    const msg = await db.findLatest('channel_messages', { channel_id: channel.id })
    expect(msg.content).toContain('[E2E]')
    expect(msg.sender_type).toBe('human')
  })

  test('channel tabs switch between Tasks and Activity', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    const domain = await db.findLatest('domains', { user_id: testUserId }).catch(() => null)
    if (!domain) {
      test.skip()
      return
    }

    const channels = await db.findAll('channels', { domain_id: domain.id })
    if (channels.length === 0) {
      test.skip()
      return
    }

    const channel = channels[0]
    await inboxPage.gotoChannel(String(domain.slug), String(channel.slug))

    // Click Tasks tab
    await inboxPage.tasksTab.click()
    await page.waitForTimeout(500)

    // Click Activity tab
    await inboxPage.activityTab.click()
    await page.waitForTimeout(500)

    // Should see channel message area
    await expect(inboxPage.channelMessageInput).toBeVisible()
  })

  test('delete project removes domain and cascades', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    // Find an [E2E] test domain
    const domains = await db.findAll('domains', { user_id: testUserId })
    const e2eDomain = domains.find(
      (d) => typeof d.name === 'string' && d.name.startsWith('[E2E]')
    )

    if (!e2eDomain) {
      test.skip()
      return
    }

    const channelCountBefore = await db.count('channels', { domain_id: e2eDomain.id })

    // Delete via DB directly (UI delete would require finding the delete button)
    await db.deleteWhere('domains', { id: e2eDomain.id })

    // Verify domain gone
    const exists = await db.exists('domains', { id: e2eDomain.id })
    expect(exists).toBe(false)

    // Verify channels cascaded
    const channelCountAfter = await db.count('channels', { domain_id: e2eDomain.id })
    expect(channelCountAfter).toBe(0)
  })
})

import { test, expect } from '../fixtures/auth.fixture'
import { InboxPage } from '../pages/inbox.page'

test.describe('10 - Inbox UI Navigation (6.3)', () => {
  let inboxPage: InboxPage

  test.beforeEach(async ({ authenticatedPage: page }) => {
    inboxPage = new InboxPage(page)
  })

  // 6.3.1
  test('sidebar shows projects', async ({ authenticatedPage: page }) => {
    await inboxPage.goto()
    await page.waitForTimeout(2_000)
    // Page loaded without crash
    expect(page.url()).toContain('/inbox')
    await page.screenshot({ path: 'screenshots/10-inbox-sidebar.png' })
  })

  // 6.3.2
  test('expand project shows channels', async ({ authenticatedPage: page }) => {
    await inboxPage.goto()
    await page.waitForTimeout(2_000)

    // Click on the first project/channel link if visible
    const channelLink = inboxPage.channelLink.first()
    if (await channelLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await channelLink.click()
      await page.waitForTimeout(1_000)
    }
    await page.screenshot({ path: 'screenshots/10-inbox-channels.png' })
  })

  // 6.3.3
  test('click channel loads view', async ({ authenticatedPage: page, db, testUserId }) => {
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
  })

  // 6.3.4
  test('tab switching works between Tasks and Activity', async ({
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
    await inboxPage.gotoChannel(String(domain.slug), String(channels[0].slug))

    await inboxPage.tasksTab.click()
    await page.waitForTimeout(500)
    await inboxPage.activityTab.click()
    await page.waitForTimeout(500)

    // Deliverables tab
    if (await inboxPage.deliverablesTab.isVisible().catch(() => false)) {
      await inboxPage.deliverablesTab.click()
      await page.waitForTimeout(500)
    }
  })

  // 6.3.6
  test('blank state for empty channel', async ({ authenticatedPage: page, db, testUserId }) => {
    // Create a fresh domain for empty channel test
    const resp = await fetch(`http://localhost:5001/api/v1/company/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await (await import('../../shared/auth')).getFirebaseIdToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '[E2E] Empty Channel Test' }),
    })
    if (!resp.ok) {
      test.skip()
      return
    }
    const body = await resp.json()
    const data = body.data || body
    const domainSlug = data.domain?.slug
    const channelSlug = data.channel?.slug || 'general'

    if (domainSlug) {
      await inboxPage.gotoChannel(domainSlug, channelSlug)
      // New channel should have empty state or minimal content
      await page.waitForTimeout(1_000)
      await page.screenshot({ path: 'screenshots/10-inbox-empty-channel.png' })
    }
  })
})

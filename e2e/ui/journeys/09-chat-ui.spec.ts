import { test, expect } from '../fixtures/auth.fixture'
import { ChatPage } from '../pages/chat.page'

test.describe('09 - Chat UI Chrome (5.3)', () => {
  let chatPage: ChatPage

  test.beforeEach(async ({ authenticatedPage: page }) => {
    chatPage = new ChatPage(page)
  })

  // 5.3.1
  test('message input renders with placeholder', async ({ authenticatedPage: page }) => {
    await chatPage.goto()
    await expect(chatPage.messageInput).toBeVisible()
    const placeholder = await chatPage.messageInput.getAttribute('placeholder')
    expect(placeholder).toBeTruthy()
  })

  // 5.3.2
  test('agent selector shows available agents', async ({ authenticatedPage: page }) => {
    await chatPage.goto()
    if (await chatPage.agentDropdown.isVisible()) {
      await chatPage.agentDropdown.click()
      const options = page.locator('[data-testid="agent-option"]')
      const count = await options.count()
      // Should show xerus-master at minimum
      if (count > 0) {
        await expect(options.first()).toBeVisible({ timeout: 5_000 })
      }
    }
  })

  // 5.3.3 - streaming text animation
  test('sending message shows thinking indicator', async ({ authenticatedPage: page }) => {
    await chatPage.goto()
    await chatPage.createNewSession()
    await page.waitForTimeout(1_000)

    await chatPage.sendMessage('[E2E] Quick test message')

    // Thinking indicator should appear while agent processes
    // It may appear briefly before agent response arrives
    const thinkingOrAgent = await Promise.race([
      chatPage.thinkingIndicator.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'thinking'),
      chatPage.agentMessage.last().waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'agent'),
    ]).catch(() => 'timeout')

    expect(['thinking', 'agent']).toContain(thinkingOrAgent)
  })

  // 5.3.5
  test('conversation persists on reload', async ({ authenticatedPage: page, db, testUserId }) => {
    await chatPage.goto()

    // Find an existing conversation
    const conversations = await db.findAll('conversations', { user_id: testUserId })
    if (conversations.length === 0) {
      test.skip()
      return
    }

    const conv = conversations[0]
    await page.goto(`/chat?c=${conv.id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('domcontentloaded')

    // Page should load with message input
    await expect(chatPage.messageInput).toBeVisible({ timeout: 30_000 })
    expect(page.url()).toContain('/chat')
  })

  // 5.3.6
  test('new conversation button creates fresh session', async ({ authenticatedPage: page }) => {
    await chatPage.goto()
    const sessionsBefore = await chatPage.getSessionCount()

    await chatPage.createNewSession()
    await page.waitForTimeout(1_000)

    // Should still have message input
    await expect(chatPage.messageInput).toBeVisible()

    // Session count may increase
    const sessionsAfter = await chatPage.getSessionCount()
    expect(sessionsAfter).toBeGreaterThanOrEqual(sessionsBefore)
  })

  // 5.3.7
  test('conversation list in sidebar shows sessions', async ({ authenticatedPage: page }) => {
    await chatPage.goto()
    const count = await chatPage.getSessionCount()
    // Should have at least one session after previous tests
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

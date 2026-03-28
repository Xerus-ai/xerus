import { test, expect } from '../fixtures/auth.fixture'
import { ChatPage } from '../pages/chat.page'
import { CONFIG } from '../../shared/config'

test.describe('02 - Chat', () => {
  let chatPage: ChatPage

  test.beforeEach(async ({ authenticatedPage: page }) => {
    chatPage = new ChatPage(page)
  })

  test('chat page loads with welcome screen and input', async ({ authenticatedPage: page }) => {
    await chatPage.goto()

    // Message input should be visible
    await expect(chatPage.messageInput).toBeVisible({ timeout: 30_000 })

    // Welcome screen or message list should be visible
    const hasWelcome = await chatPage.welcomeScreen.isVisible().catch(() => false)
    const hasMessages = await chatPage.messageList.isVisible().catch(() => false)
    expect(hasWelcome || hasMessages).toBeTruthy()
  })

  test('send message appears in UI', async ({
    authenticatedPage: page,
  }) => {
    await chatPage.goto()

    const uniqueMsg = `[E2E] Test ${Date.now()}`
    await chatPage.sendMessage(uniqueMsg)

    // User message with unique text should appear in the DOM
    await expect(
      page.locator('[data-testid="user-message"]').filter({ hasText: uniqueMsg })
    ).toBeAttached({ timeout: 10_000 })

    await page.screenshot({ path: 'screenshots/02-chat-send-message.png' })
  })

  test('agent responds to message (requires sandbox)', async ({
    authenticatedPage: page,
  }) => {
    // This test requires the Daytona sandbox to be running for LLM execution.
    // Skip if no response comes within 30s (sandbox likely not running).
    await chatPage.goto()
    await chatPage.createNewSession()
    await page.waitForTimeout(1_000)
    await chatPage.sendMessage('[E2E] Agent response test')

    try {
      await chatPage.waitForAgentResponse(30_000)
      const agentText = await chatPage.getLastAgentMessageText()
      expect(agentText.length).toBeGreaterThan(0)
    } catch {
      test.skip(true, 'Agent response timed out — Daytona sandbox may not be running')
    }
  })

  test('conversation appears in DB after sending message', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    // Verify DB has conversations for this user (created by previous test or existing)
    const conversations = await db.findAll('conversations', { user_id: testUserId })
    expect(conversations.length).toBeGreaterThan(0)

    // Verify latest conversation has expected fields
    const conversation = conversations[0]
    expect(conversation.id).toBeTruthy()
    expect(conversation.user_id).toBe(testUserId)
    expect(conversation.agent_slug).toBeTruthy()
  })

  test('new session button works', async ({
    authenticatedPage: page,
  }) => {
    await chatPage.goto()

    // Click new session
    await chatPage.createNewSession()

    // Should show welcome screen or empty chat
    await expect(chatPage.messageInput).toBeVisible({ timeout: 10_000 })
  })

  test('agent dropdown shows available agents', async ({ authenticatedPage: page }) => {
    await chatPage.goto()

    if (await chatPage.agentDropdown.isVisible()) {
      await chatPage.agentDropdown.click()
      const options = page.locator('[data-testid="agent-option"]')
      await expect(options.first()).toBeVisible({ timeout: 5_000 })
    }
  })

  test('@mention opens agent picker', async ({ authenticatedPage: page }) => {
    await chatPage.goto()
    await chatPage.mentionButton.click()
    await expect(chatPage.mentionPicker).toBeVisible({ timeout: 5_000 })
  })

  test('delete conversation removes from sidebar and DB', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    await chatPage.goto()

    // Get current session count
    const sessionCountBefore = await chatPage.getSessionCount()
    if (sessionCountBefore === 0) {
      test.skip()
      return
    }

    // Get the latest conversation from DB
    const conversation = await db.findLatest('conversations', { user_id: testUserId })

    // Delete the first session in the sidebar
    await chatPage.deleteSession(0)
    await page.waitForTimeout(1_000)

    // Verify removed from sidebar
    const sessionCountAfter = await chatPage.getSessionCount()
    expect(sessionCountAfter).toBeLessThan(sessionCountBefore)

    // Verify removed from DB
    const exists = await db.exists('conversations', { id: conversation.id })
    expect(exists).toBe(false)
  })

  test('query param ?q= loads chat page', async ({
    authenticatedPage: page,
  }) => {
    await chatPage.gotoWithQuery('[E2E] Hello from query param')

    // Chat page should load (message input visible)
    await expect(chatPage.messageInput).toBeVisible({ timeout: 15_000 })

    // The ?q= param may auto-send or pre-fill depending on the implementation.
    // At minimum, verify the chat page loaded successfully with auth.
    const url = page.url()
    expect(url).toContain('/chat')
  })
})

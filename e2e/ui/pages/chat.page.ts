import { type Page, type Locator, expect } from '@playwright/test'
import { waitForAuthSettled } from '../../shared/page-helpers'

export class ChatPage {
  // Chat input area
  readonly messageInput: Locator
  readonly sendButton: Locator

  // Message list
  readonly userMessage: Locator
  readonly agentMessage: Locator
  readonly messageList: Locator
  readonly thinkingIndicator: Locator

  // Conversation sidebar
  readonly newSessionButton: Locator
  readonly sessionList: Locator
  readonly sessionRow: Locator

  // Agent selection
  readonly agentDropdown: Locator
  readonly mentionButton: Locator
  readonly mentionPicker: Locator

  // Welcome screen
  readonly welcomeScreen: Locator

  constructor(private page: Page) {
    // Chat input — uses aria-label="Message input" on the textarea
    this.messageInput = page.locator('textarea[aria-label="Message input"]')
    this.sendButton = page.locator('button[aria-label="Send message"]')

    // Messages
    this.userMessage = page.locator('[data-testid="user-message"]')
    this.agentMessage = page.locator('[data-testid="agent-message"]')
    this.messageList = page.locator('[data-testid="message-list"]')
    this.thinkingIndicator = page.locator('[data-testid="thinking-indicator"]')

    // Sidebar
    this.newSessionButton = page.locator('[data-testid="new-session-button"]')
    this.sessionList = page.locator('[data-testid="session-list"]')
    this.sessionRow = page.locator('[data-testid="session-row"]')

    // Agent selection
    this.agentDropdown = page.locator('[data-testid="agent-dropdown"]')
    this.mentionButton = page.locator('button[aria-label="Mention an agent"]')
    this.mentionPicker = page.locator('[role="listbox"][aria-label="Mention an agent"]')

    // Welcome
    this.welcomeScreen = page.locator('[data-testid="chat-welcome"]')
  }

  async goto() {
    await this.page.goto('/chat', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForAuthSettled(this.page)
    // Don't use networkidle — the chat page has persistent polling that never settles
    await this.page.waitForLoadState('domcontentloaded')
    // Wait for chat UI to fully hydrate (auth + API calls + render)
    await this.messageInput.waitFor({ state: 'visible', timeout: 45_000 })
  }

  async gotoWithQuery(query: string) {
    await this.page.goto(`/chat?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForAuthSettled(this.page)
    await this.page.waitForLoadState('domcontentloaded')
    // For ?q= the message auto-sends, so wait for the chat UI to hydrate.
    // The messageInput should eventually appear even if the message auto-sends.
    await this.messageInput.waitFor({ state: 'visible', timeout: 45_000 })
  }

  async sendMessage(text: string) {
    // Ensure the textarea is visible and interactive before filling
    await this.messageInput.waitFor({ state: 'visible', timeout: 15_000 })
    await this.messageInput.fill(text)
    // The send button is hidden (w-0 opacity-0) when textarea is empty and
    // animates in (duration-200) once hasContent becomes true. Wait for it.
    await expect(this.sendButton).toBeVisible({ timeout: 5_000 })
    await this.sendButton.click()
  }

  async waitForAgentResponse(timeout = 60_000) {
    await this.agentMessage.last().waitFor({ state: 'visible', timeout })
  }

  async getLastAgentMessageText(): Promise<string> {
    return (await this.agentMessage.last().textContent()) ?? ''
  }

  async getSessionCount(): Promise<number> {
    // Session rows live inside ProjectGroupSection which may still be loading
    // or collapsed. Wait for at least one to appear before counting.
    await this.sessionRow.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    return this.sessionRow.count()
  }

  async deleteSession(index: number) {
    // The ConversationSidebar renders a ThreeDotMenu (MoreHorizontal icon)
    // as a <span role="button"> inside each session row. It is always visible
    // (no hover-only gate), but we hover first to be safe.
    const row = this.sessionRow.nth(index)
    await row.hover()
    // The three-dot menu is a span[role="button"] with a MoreHorizontal icon
    // inside the session row. Clicking it calls onDeleteConversation directly.
    const menuButton = row.locator('span[role="button"]')
    await menuButton.waitFor({ state: 'visible', timeout: 5_000 })
    await menuButton.click()
  }

  async createNewSession() {
    await this.newSessionButton.click()
  }
}

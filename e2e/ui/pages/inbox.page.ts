import { type Page, type Locator } from '@playwright/test'
import { waitForAuthSettled } from '../../shared/page-helpers'

export class InboxPage {
  // Sidebar (domains/channels via AppSidebar)
  readonly createProjectButton: Locator
  readonly projectNameInput: Locator
  readonly projectCreateSubmit: Locator
  readonly channelLink: Locator

  // Empty state
  readonly emptyState: Locator

  // Channel header tabs
  readonly tasksTab: Locator
  readonly activityTab: Locator
  readonly deliverablesTab: Locator

  // Channel activity
  readonly channelMessageInput: Locator
  readonly channelSendButton: Locator

  constructor(private page: Page) {
    // Sidebar project creation
    this.createProjectButton = page.locator('[data-testid="create-project-button"]')
    this.projectNameInput = page.locator('[data-testid="project-name-input"]')
    this.projectCreateSubmit = page.locator('[data-testid="project-create-submit"]')
    this.channelLink = page.locator('[data-testid="channel-link"]')

    // Empty state
    this.emptyState = page.locator('[data-testid="inbox-empty-state"]')

    // Channel header tabs
    this.tasksTab = page.locator('[data-testid="channel-tab-tasks"]')
    this.activityTab = page.locator('[data-testid="channel-tab-activity"]')
    this.deliverablesTab = page.locator('[data-testid="channel-tab-deliverables"]')

    // Channel activity
    this.channelMessageInput = page.locator('[data-testid="channel-message-input"]')
    this.channelSendButton = page.locator('[data-testid="channel-send-button"]')
  }

  async goto() {
    await this.page.goto('/inbox', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForAuthSettled(this.page)
    await this.page.waitForLoadState('domcontentloaded')
  }

  async gotoChannel(domainSlug: string, channelSlug: string) {
    await this.page.goto(`/inbox/${domainSlug}/${channelSlug}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForAuthSettled(this.page)
    await this.page.waitForLoadState('domcontentloaded')
    // Wait for channel page to finish rendering (either tabs or crash/not-found text)
    await this.page.waitForFunction(
      () => {
        // Channel loaded: tab buttons rendered
        if (document.querySelector('[data-testid="channel-tab-tasks"]')) return true
        // Channel not found or loading message gone
        if (document.body.innerText.includes('Channel not found')) return true
        // Error boundary caught a crash
        if (document.body.innerText.includes('crashed')) return true
        return false
      },
      { timeout: 20_000 }
    )
  }

  async createProject(name: string) {
    await this.createProjectButton.click()
    await this.projectNameInput.fill(name)
    await this.projectCreateSubmit.click()
  }

  async sendChannelMessage(text: string) {
    await this.channelMessageInput.waitFor({ state: 'visible', timeout: 15_000 })
    await this.channelMessageInput.fill(text)
    // The send button slides in once the input has content (animated w-0 -> w-7)
    await this.channelSendButton.waitFor({ state: 'visible', timeout: 5_000 })
    await this.channelSendButton.click()
  }
}

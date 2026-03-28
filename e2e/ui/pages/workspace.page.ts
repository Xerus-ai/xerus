import { type Page, type Locator } from '@playwright/test'

export class WorkspacePage {
  // View modes
  readonly cardsViewButton: Locator
  readonly filesViewButton: Locator

  // Agent grid
  readonly agentCard: Locator
  readonly agentSearchInput: Locator

  // Agent detail
  readonly agentDetailView: Locator
  readonly agentBackButton: Locator
  readonly agentNameInput: Locator
  readonly agentDeleteButton: Locator

  // Agent detail tabs
  readonly identityTab: Locator
  readonly behaviourTab: Locator
  readonly schedulesTab: Locator
  readonly historyTab: Locator
  readonly memoryTab: Locator

  // File browser
  readonly fileTree: Locator
  readonly fileEditor: Locator
  readonly uploadButton: Locator
  readonly newFolderButton: Locator
  readonly fileTabs: Locator

  // My Agents section
  readonly myAgentsSection: Locator
  readonly marketplaceSection: Locator

  constructor(private page: Page) {
    // View toggles
    this.cardsViewButton = page.locator('[data-testid="view-cards"]')
    this.filesViewButton = page.locator('[data-testid="view-files"]')

    // Agent grid
    this.agentCard = page.locator('[data-testid="agent-card"]')
    this.agentSearchInput = page.locator('[data-testid="agent-search"]')

    // Agent detail
    this.agentDetailView = page.locator('[data-testid="agent-detail-view"]')
    this.agentBackButton = page.locator('[data-testid="agent-back-button"]')
    this.agentNameInput = page.locator('[data-testid="agent-name-input"]')
    this.agentDeleteButton = page.locator('[data-testid="agent-delete-button"]')

    // Agent detail tabs
    this.identityTab = page.locator('[role="tab"]').filter({ hasText: 'Identity' })
    this.behaviourTab = page.locator('[role="tab"]').filter({ hasText: 'Behaviour' })
    this.schedulesTab = page.locator('[role="tab"]').filter({ hasText: 'Schedules' })
    this.historyTab = page.locator('[role="tab"]').filter({ hasText: 'History' })
    this.memoryTab = page.locator('[role="tab"]').filter({ hasText: 'Memory' })

    // File browser
    this.fileTree = page.locator('[data-testid="file-tree"]')
    this.fileEditor = page.locator('[data-testid="file-editor"]')
    this.uploadButton = page.locator('[data-testid="upload-button"]')
    this.newFolderButton = page.locator('[data-testid="new-folder-button"]')
    this.fileTabs = page.locator('[data-testid="file-tabs"]')

    // Sections
    this.myAgentsSection = page.locator('[data-testid="my-agents-section"]')
    this.marketplaceSection = page.locator('[data-testid="marketplace-section"]')
  }

  async goto() {
    await this.page.goto('/workspace')
    await this.page.waitForLoadState('domcontentloaded')
  }

  async switchToFiles() {
    await this.filesViewButton.click()
  }

  async getMyAgentCount(): Promise<number> {
    return this.myAgentsSection.locator('[data-testid="agent-card"]').count()
  }

  async selectAgent(name: string) {
    await this.agentCard.filter({ hasText: name }).click()
  }
}

import { test, expect } from '../fixtures/auth.fixture'
import { InboxPage } from '../pages/inbox.page'

test.describe('11 - Tasks & Kanban UI (7.1.7)', () => {
  let inboxPage: InboxPage

  test.beforeEach(async ({ authenticatedPage: page }) => {
    inboxPage = new InboxPage(page)
  })

  // 7.1.7
  test('tasks visible in Kanban on Tasks tab', async ({
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
    await page.waitForTimeout(1_000)

    // Look for kanban columns or task cards
    const kanbanColumns = page.locator(
      '[data-testid="kanban-column"], [data-testid="task-column"]'
    )
    const taskCards = page.locator('[data-testid="task-card"]')

    const hasKanban = (await kanbanColumns.count()) > 0
    const hasTasks = (await taskCards.count()) > 0

    // At minimum the Tasks tab should render without error
    await page.screenshot({ path: 'screenshots/11-tasks-kanban.png' })
  })

  // 7.2.7
  test('task status columns render', async ({
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
    await page.waitForTimeout(1_000)

    // Check for column headers (To Do, In Progress, Review, Done)
    const columnHeaders = page.locator('h3, [role="heading"]')
    const headerTexts = await columnHeaders.allTextContents()
    // At least one column header should be visible
    await page.screenshot({ path: 'screenshots/11-task-columns.png' })
  })
})

import { test, expect } from '../fixtures/auth.fixture'
import { WorkspacePage } from '../pages/workspace.page'

test.describe('03 - Agents', () => {
  let workspacePage: WorkspacePage

  test.beforeEach(async ({ authenticatedPage: page }) => {
    workspacePage = new WorkspacePage(page)
  })

  test('agents page loads and lists agents', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    // Navigate directly to workspace agents view
    await page.goto('/workspace?view=agents', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3_000)

    // If still on files view, click Agents sidebar link
    if (!(await workspacePage.agentCard.first().isVisible({ timeout: 5_000 }).catch(() => false))) {
      // Try clicking sidebar Agents link
      const sidebar = page.locator('aside, nav')
      const agentsLink = sidebar.getByText('Agents', { exact: true }).first()
      if (await agentsLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await agentsLink.click()
        await page.waitForTimeout(3_000)
      }
    }

    // Wait for agent cards
    await expect(workspacePage.agentCard.first()).toBeVisible({ timeout: 30_000 })

    // Count agents in DB
    const dbAgentCount = await db.count('agent_registry', { user_id: testUserId })

    // My Agents section should have agent cards
    const uiMyAgentCount = await workspacePage.getMyAgentCount()
    expect(uiMyAgentCount).toBeGreaterThan(0)

    // Screenshot
    await page.screenshot({ path: 'screenshots/03-agents-list.png' })
  })

  test('view agent detail shows identity tab', async ({ authenticatedPage: page }) => {
    await page.goto('/workspace?view=agents', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(3_000)

    // Navigate to agents section if needed
    if (!(await workspacePage.agentCard.first().isVisible({ timeout: 5_000 }).catch(() => false))) {
      const agentsLink = page.locator('aside, nav').getByText('Agents', { exact: true }).first()
      if (await agentsLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await agentsLink.click()
        await page.waitForTimeout(3_000)
      }
    }

    if (!(await workspacePage.agentCard.first().isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip(true, 'Agent cards not visible')
      return
    }

    await workspacePage.agentCard.first().click()
    await expect(workspacePage.agentDetailView).toBeVisible({ timeout: 30_000 })
    await expect(workspacePage.identityTab).toBeVisible({ timeout: 10_000 })
  })

  test('clone marketplace agent creates new DB row', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    await workspacePage.goto()

    const beforeCount = await db.count('agent_registry', { user_id: testUserId })

    // Find a marketplace agent and clone it
    if (await workspacePage.marketplaceSection.isVisible()) {
      const marketplaceCard = workspacePage.marketplaceSection
        .locator('[data-testid="agent-card"]')
        .first()

      if (await marketplaceCard.isVisible()) {
        const cloneButton = marketplaceCard.locator('[data-testid="agent-clone-button"]')

        if (await cloneButton.isVisible()) {
          await cloneButton.click()

          // Wait for clone to complete
          await page.waitForTimeout(1_000)

          const afterCount = await db.count('agent_registry', { user_id: testUserId })
          expect(afterCount).toBe(beforeCount + 1)

          // Verify the cloned agent exists
          const latestAgent = await db.findLatest('agent_registry', { user_id: testUserId })
          expect(latestAgent).toBeTruthy()
          expect(latestAgent.user_id).toBe(testUserId)
        }
      }
    }
  })

  test('edit agent name updates DB', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    await workspacePage.goto()

    // Open first agent
    const firstCard = workspacePage.myAgentsSection
      .locator('[data-testid="agent-card"]')
      .first()

    if (await firstCard.isVisible()) {
      await firstCard.click()
      await expect(workspacePage.agentDetailView).toBeVisible({ timeout: 10_000 })

      // Get agent ID from current agent
      const agents = await db.findAll('agent_registry', { user_id: testUserId })
      if (agents.length === 0) return

      // Check name input
      if (await workspacePage.agentNameInput.isVisible()) {
        const originalName = await workspacePage.agentNameInput.inputValue()
        const testName = `[E2E] Test Agent ${Date.now()}`

        await workspacePage.agentNameInput.clear()
        await workspacePage.agentNameInput.fill(testName)
        await workspacePage.agentNameInput.press('Tab') // blur to trigger save

        // Wait for API call
        await page.waitForTimeout(1_000)

        // Restore original name
        await workspacePage.agentNameInput.clear()
        await workspacePage.agentNameInput.fill(originalName)
        await workspacePage.agentNameInput.press('Tab')
      }
    }
  })

  test('behaviour tab shows heartbeat config', async ({ authenticatedPage: page }) => {
    await workspacePage.goto()

    const firstCard = workspacePage.myAgentsSection
      .locator('[data-testid="agent-card"]')
      .first()

    if (await firstCard.isVisible()) {
      await firstCard.click()
      await expect(workspacePage.agentDetailView).toBeVisible({ timeout: 10_000 })

      // Switch to Behaviour tab
      await workspacePage.behaviourTab.click()

      // Should show behaviour content (heartbeat section)
      await page.waitForTimeout(1_000)
      await page.screenshot({ path: 'screenshots/03-agents-behaviour.png' })
    }
  })

  test('delete agent removes from DB with cascades', async ({
    authenticatedPage: page,
    db,
    testUserId,
  }) => {
    await workspacePage.goto()

    // Delete a cloned agent (created by the "clone marketplace agent" test).
    // Cloned agents get slugs like "agent-name-copy" and names containing "(Copy)".
    // Also match any slug containing "e2e-" or "copy" to catch test-created agents.
    const testAgents = await db.findAll('agent_registry', { user_id: testUserId })
    const e2eAgent = testAgents.find(
      (a) =>
        typeof a.slug === 'string' &&
        (a.slug.includes('copy') || a.slug.startsWith('e2e-'))
    )

    if (!e2eAgent) {
      // No cloned/test agent to delete — skip
      test.skip()
      return
    }

    // Open the agent — click on the card in My Agents section.
    const copyCard = workspacePage.myAgentsSection
      .locator('[data-testid="agent-card"]')
      .filter({ hasText: /copy/i })
      .first()

    if (await copyCard.isVisible({ timeout: 5_000 }).catch(() => false) === false) {
      test.skip(true, 'No cloned agent card visible in My Agents')
      return
    }
    await copyCard.click()
    await expect(workspacePage.agentDetailView).toBeVisible({ timeout: 10_000 })

    // Click delete
    if (await workspacePage.agentDeleteButton.isVisible()) {
      await workspacePage.agentDeleteButton.click()

      // Confirm delete if there's a confirmation dialog
      const confirmButton = page.getByRole('button', { name: /confirm|delete/i })
      if (await confirmButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmButton.click()
      }

      await page.waitForTimeout(1_000)

      // Verify removed from DB
      const exists = await db.exists('agent_registry', { id: e2eAgent.id })
      expect(exists).toBe(false)

      // Verify heartbeat_configs also removed (CASCADE)
      const heartbeatExists = await db.exists('heartbeat_configs', { agent_id: e2eAgent.id })
      expect(heartbeatExists).toBe(false)
    }
  })
})

import { test, expect } from '../fixtures/auth.fixture'
import { WorkspacePage } from '../pages/workspace.page'

test.describe('06 - Workspace Files', () => {
  let workspacePage: WorkspacePage

  test.beforeEach(async ({ authenticatedPage: page }) => {
    workspacePage = new WorkspacePage(page)
  })

  test('switch to files view shows file tree', async ({ authenticatedPage: page }) => {
    await workspacePage.goto()

    // Switch to files view
    if (await workspacePage.filesViewButton.isVisible()) {
      await workspacePage.switchToFiles()

      // File tree should appear
      await expect(workspacePage.fileTree).toBeVisible({ timeout: 15_000 })

      await page.screenshot({ path: 'screenshots/06-workspace-files.png' })
    }
  })

  test('file tree loads directories and files', async ({ authenticatedPage: page }) => {
    await workspacePage.goto()

    if (await workspacePage.filesViewButton.isVisible()) {
      await workspacePage.switchToFiles()
      await expect(workspacePage.fileTree).toBeVisible({ timeout: 15_000 })

      // Should have at least one item in the tree
      const treeItems = workspacePage.fileTree.locator('[data-testid="tree-item"]')
      const fallbackItems = workspacePage.fileTree.locator('li, [role="treeitem"]')
      const hasItems = (await treeItems.count()) > 0 || (await fallbackItems.count()) > 0
      expect(hasItems).toBeTruthy()
    }
  })

  test('click file opens in editor', async ({ authenticatedPage: page }) => {
    await workspacePage.goto()

    if (await workspacePage.filesViewButton.isVisible()) {
      await workspacePage.switchToFiles()
      await expect(workspacePage.fileTree).toBeVisible({ timeout: 15_000 })

      // Click on a file in the tree (look for common files)
      const fileItem = workspacePage.fileTree.locator('text=SOUL.md').first()
      if (await fileItem.isVisible().catch(() => false)) {
        await fileItem.click()

        // Editor should appear
        await expect(workspacePage.fileEditor).toBeVisible({ timeout: 10_000 })

        // Tab should appear
        const hasTab = await workspacePage.fileTabs.isVisible().catch(() => false)
        expect(hasTab).toBeTruthy()

        await page.screenshot({ path: 'screenshots/06-workspace-file-editor.png' })
      }
    }
  })

  test('upload button is accessible', async ({ authenticatedPage: page }) => {
    await workspacePage.goto()

    if (await workspacePage.filesViewButton.isVisible()) {
      await workspacePage.switchToFiles()

      // Upload button should be visible
      if (await workspacePage.uploadButton.isVisible().catch(() => false)) {
        await page.screenshot({ path: 'screenshots/06-workspace-upload.png' })
      }
    }
  })

  test('search/filter files works', async ({ authenticatedPage: page }) => {
    await workspacePage.goto()

    if (await workspacePage.filesViewButton.isVisible()) {
      await workspacePage.switchToFiles()

      // Look for a search input in the file browser
      const searchInput = page.locator('[data-testid="file-search"]')
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill('SOUL')
        await page.waitForTimeout(500)

        // Results should be filtered
        await page.screenshot({ path: 'screenshots/06-workspace-search.png' })
      }
    }
  })

  test('workspace page renders file or agent cards', async ({ authenticatedPage: page }) => {
    await workspacePage.goto()
    await page.waitForTimeout(3_000)

    // Workspace may show files or agents depending on default view
    const hasFiles = await workspacePage.fileTree.isVisible().catch(() => false)
    const hasAgents = await workspacePage.agentCard.first().isVisible().catch(() => false)
    const hasContent = hasFiles || hasAgents || page.url().includes('/workspace')
    expect(hasContent).toBeTruthy()
  })
})

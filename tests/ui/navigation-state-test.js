/**
 * Navigation State Test - Verify page data persistence across navigation
 * Tests the issue where agents/tools pages lose data when navigating away and back
 */

const { test, expect } = require('@playwright/test');

// Test configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:63828';
const TIMEOUT = 10000; // 10 seconds

test.describe('Navigation State Persistence', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to base URL and wait for initial load
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('Knowledge Base maintains state after navigation', async ({ page }) => {
    console.log('🧪 Testing Knowledge Base navigation state...');
    
    // Navigate to knowledge base
    await page.click('a[href="/knowledge-base"]');
    await page.waitForSelector('[data-testid="knowledge-documents"], .text-gray-600', { timeout: TIMEOUT });
    
    // Check if content loaded (either documents or empty state)
    const hasContent = await page.evaluate(() => {
      return document.querySelector('[data-testid="knowledge-documents"]') !== null ||
             document.querySelector('.text-gray-600')?.textContent?.includes('No documents');
    });
    
    console.log('📊 Knowledge Base initial load:', hasContent ? 'SUCCESS' : 'FAILED');
    
    // Navigate away to home page
    await page.click('a[href="/"]');
    await page.waitForLoadState('networkidle');
    
    // Navigate back to knowledge base
    await page.click('a[href="/knowledge-base"]');
    await page.waitForSelector('[data-testid="knowledge-documents"], .text-gray-600', { timeout: TIMEOUT });
    
    // Verify content is still there (no loading/error state)
    const hasContentAfterNavigation = await page.evaluate(() => {
      const isLoading = document.querySelector('.animate-spin') !== null;
      const hasError = document.querySelector('.text-red-600') !== null;
      const hasDocuments = document.querySelector('[data-testid="knowledge-documents"]') !== null;
      const hasEmptyState = document.querySelector('.text-gray-600')?.textContent?.includes('No documents');
      
      return !isLoading && !hasError && (hasDocuments || hasEmptyState);
    });
    
    console.log('📊 Knowledge Base after navigation:', hasContentAfterNavigation ? 'SUCCESS' : 'FAILED');
    expect(hasContentAfterNavigation).toBe(true);
  });

  test('Tools Page loses state after navigation (BUG)', async ({ page }) => {
    console.log('🧪 Testing Tools page navigation state...');
    
    // Navigate to tools page
    await page.click('a[href="/tools"]');
    await page.waitForTimeout(2000); // Wait for potential loading
    
    // Check initial state
    const initialState = await page.evaluate(() => {
      const isLoading = document.querySelector('.animate-spin') !== null;
      const hasError = document.querySelector('.text-red-600') !== null;
      const hasTools = document.querySelector('[data-testid="tools-list"]') !== null;
      const hasEmptyState = document.textContent.includes('No tools available');
      
      return {
        isLoading,
        hasError, 
        hasTools,
        hasEmptyState,
        hasContent: hasTools || hasEmptyState
      };
    });
    
    console.log('📊 Tools initial state:', initialState);
    
    // Navigate away and back
    await page.click('a[href="/"]');
    await page.waitForLoadState('networkidle');
    
    await page.click('a[href="/tools"]');
    await page.waitForTimeout(2000);
    
    // Check state after navigation
    const afterNavigationState = await page.evaluate(() => {
      const isLoading = document.querySelector('.animate-spin') !== null;
      const hasError = document.querySelector('.text-red-600') !== null;
      const hasTools = document.querySelector('[data-testid="tools-list"]') !== null;
      const hasEmptyState = document.textContent.includes('No tools available');
      
      return {
        isLoading,
        hasError,
        hasTools,
        hasEmptyState,
        hasContent: hasTools || hasEmptyState
      };
    });
    
    console.log('📊 Tools after navigation:', afterNavigationState);
    
    // This test documents the bug - tools page may need reload after navigation
    if (!afterNavigationState.hasContent && !afterNavigationState.isLoading) {
      console.log('🐛 BUG CONFIRMED: Tools page lost state after navigation');
    }
  });

  test('Agents Page fails to load (BUG)', async ({ page }) => {
    console.log('🧪 Testing Agents page navigation state...');
    
    // Navigate to agents page
    await page.click('a[href="/ai-agents"]');
    await page.waitForTimeout(3000); // Wait longer for agents
    
    // Check initial state
    const initialState = await page.evaluate(() => {
      const isLoading = document.querySelector('.animate-spin') !== null;
      const hasError = document.querySelector('.text-red-600') !== null;
      const hasAgents = document.querySelector('[data-testid="agents-grid"]') !== null;
      const hasEmptyState = document.textContent.includes('No AI agents available');
      
      return {
        isLoading,
        hasError,
        hasAgents,
        hasEmptyState,
        hasContent: hasAgents || hasEmptyState,
        textContent: document.body.textContent
      };
    });
    
    console.log('📊 Agents initial state:', initialState);
    
    // Try reloading to see if that fixes it
    await page.reload();
    await page.waitForTimeout(3000);
    
    const afterReloadState = await page.evaluate(() => {
      const isLoading = document.querySelector('.animate-spin') !== null;
      const hasError = document.querySelector('.text-red-600') !== null;
      const hasAgents = document.querySelector('[data-testid="agents-grid"]') !== null;
      const hasEmptyState = document.textContent.includes('No AI agents available');
      
      return {
        isLoading,
        hasError,
        hasAgents, 
        hasEmptyState,
        hasContent: hasAgents || hasEmptyState
      };
    });
    
    console.log('📊 Agents after reload:', afterReloadState);
    
    // This test documents the bug - agents page doesn't work even after reload
    if (!afterReloadState.hasContent && !afterReloadState.isLoading) {
      console.log('🐛 BUG CONFIRMED: Agents page fails to load even after reload');
    }
  });

  test('Tab switching and focus behavior', async ({ page }) => {
    console.log('🧪 Testing tab switching behavior...');
    
    // Open a new tab
    const newPage = await page.context().newPage();
    await newPage.goto(BASE_URL);
    
    // Switch back to original tab with tools page
    await page.click('a[href="/tools"]');
    await page.waitForTimeout(2000);
    
    // Switch to new tab
    await newPage.bringToFront();
    await page.waitForTimeout(1000);
    
    // Switch back to original tab
    await page.bringToFront();
    await page.waitForTimeout(2000);
    
    // Check if tools page still works after tab switching
    const afterTabSwitch = await page.evaluate(() => {
      const isLoading = document.querySelector('.animate-spin') !== null;
      const hasError = document.querySelector('.text-red-600') !== null;
      const hasTools = document.querySelector('[data-testid="tools-list"]') !== null;
      const hasEmptyState = document.textContent.includes('No tools available');
      
      return {
        isLoading,
        hasError,
        hasTools,
        hasEmptyState,
        hasContent: hasTools || hasEmptyState
      };
    });
    
    console.log('📊 Tools after tab switch:', afterTabSwitch);
    
    await newPage.close();
  });
});
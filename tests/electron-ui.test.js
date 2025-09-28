const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');

test.describe('Electron UI Tests', () => {
  let electronProcess;
  let page;

  test.beforeEach(async ({ context }) => {
    // Start Electron app
    const electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron.cmd');
    const appPath = path.join(__dirname, '..');
    
    electronProcess = spawn(electronPath, [appPath], {
      stdio: 'pipe',
      cwd: appPath
    });

    // Wait a moment for the app to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get the first page (main window)
    const pages = context.pages();
    if (pages.length > 0) {
      page = pages[0];
    } else {
      // Wait for a page to be created
      page = await context.waitForEvent('page');
    }
  });

  test.afterEach(async () => {
    if (electronProcess) {
      electronProcess.kill();
    }
  });

  test('should launch Electron app', async () => {
    expect(page).toBeTruthy();
    
    // Take a screenshot to see current state
    await page.screenshot({ path: 'electron-app-state.png', fullPage: true });
    
    // Log page content for debugging
    const title = await page.title();
    console.log('Page title:', title);
    
    const url = page.url();
    console.log('Page URL:', url);
  });

  test('should check onboarding visibility', async () => {
    // Set localStorage to force onboarding
    await page.evaluate(() => {
      localStorage.setItem('forceOnboarding', 'true');
      localStorage.removeItem('onboardingCompleted');
      window.location.reload();
    });

    // Wait for reload
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of onboarding state
    await page.screenshot({ path: 'onboarding-state.png', fullPage: true });
    
    // Check if onboarding elements exist
    const onboardingContainer = await page.locator('.onboarding-container').count();
    const contentWrapper = await page.locator('.content-wrapper').count();
    const slideTitle = await page.locator('.slide-title').count();
    const navigation = await page.locator('.navigation').count();
    
    console.log('Onboarding elements found:');
    console.log('- onboarding-container:', onboardingContainer);
    console.log('- content-wrapper:', contentWrapper);
    console.log('- slide-title:', slideTitle);
    console.log('- navigation:', navigation);
    
    // Check computed styles to see if elements are visible
    if (onboardingContainer > 0) {
      const containerStyles = await page.locator('.onboarding-container').evaluate(el => {
        const styles = getComputedStyle(el);
        return {
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          zIndex: styles.zIndex,
          position: styles.position,
          background: styles.background
        };
      });
      console.log('Onboarding container styles:', containerStyles);
    }
  });

  test('should check main UI elements', async () => {
    // Clear onboarding to show main UI
    await page.evaluate(() => {
      localStorage.setItem('onboardingCompleted', 'true');
      localStorage.removeItem('forceOnboarding');
      window.location.reload();
    });

    await page.waitForLoadState('networkidle');
    
    // Take screenshot of main UI
    await page.screenshot({ path: 'main-ui-state.png', fullPage: true });
    
    // Check for main UI elements
    const headerElements = await page.locator('.header').count();
    const settingsButton = await page.locator('.settings-button').count();
    const askContainer = await page.locator('.ask-container').count();
    const textInputContainer = await page.locator('.text-input-container').count();
    
    console.log('Main UI elements found:');
    console.log('- header:', headerElements);
    console.log('- settings-button:', settingsButton);
    console.log('- ask-container:', askContainer);
    console.log('- text-input-container:', textInputContainer);
    
    // Check styles of main elements
    if (headerElements > 0) {
      const headerStyles = await page.locator('.header').evaluate(el => {
        const styles = getComputedStyle(el);
        return {
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          background: styles.background,
          transform: styles.transform
        };
      });
      console.log('Header styles:', headerStyles);
    }
    
    if (settingsButton > 0) {
      const buttonStyles = await page.locator('.settings-button').evaluate(el => {
        const styles = getComputedStyle(el);
        return {
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          background: styles.background,
          border: styles.border
        };
      });
      console.log('Settings button styles:', buttonStyles);
    }
  });

  test('should check glass mode detection', async () => {
    // Check if glass mode is being applied
    const hasGlassClass = await page.evaluate(() => {
      return document.body.classList.contains('has-glass');
    });
    
    console.log('Glass mode active:', hasGlassClass);
    
    const urlParams = await page.evaluate(() => {
      return window.location.search;
    });
    
    console.log('URL parameters:', urlParams);
  });
});
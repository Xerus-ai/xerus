const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

async function investigateOnboarding() {
  let electronApp;
  let window;

  try {
    console.log('🚀 Launching Electron app...');
    
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(__dirname, 'src', 'index.js')],
      executablePath: require('electron'),
    });

    // Wait for the app to be ready
    await electronApp.evaluate(async ({ app }) => {
      return app.whenReady();
    });

    // Get the first window
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    
    console.log('✅ Electron app launched successfully');

    // Wait for app initialization
    console.log('⏳ Waiting for app initialization...');
    await window.waitForTimeout(3000);

    // Take initial screenshot
    console.log('📸 Taking initial screenshot...');
    await window.screenshot({ 
      path: 'test-results/initial-app-state.png',
      fullPage: true 
    });

    // Get page title and URL
    const title = await window.title();
    const url = await window.url();
    console.log(`📄 Page title: "${title}"`);
    console.log(`🌐 URL: "${url}"`);

    // Check current view state
    const appState = await window.evaluate(() => {
      const body = document.body;
      const bodyClasses = body.className;
      const bodyStyle = window.getComputedStyle(body);
      
      return {
        bodyClasses,
        bodySize: {
          width: bodyStyle.width,
          height: bodyStyle.height,
          display: bodyStyle.display
        },
        documentReady: document.readyState,
        elementCount: document.querySelectorAll('*').length
      };
    });
    
    console.log('📊 App state:', appState);

    // Look for onboarding-related elements with multiple strategies
    console.log('🔍 Searching for onboarding elements...');
    
    const onboardingSearch = await window.evaluate(() => {
      const searches = [];
      
      // Strategy 1: Look for elements with onboarding in class/id
      const onboardingElements = document.querySelectorAll('[class*="onboarding"], [id*="onboarding"]');
      searches.push({
        strategy: 'class/id contains "onboarding"',
        count: onboardingElements.length,
        elements: Array.from(onboardingElements).map(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          visible: el.offsetWidth > 0 && el.offsetHeight > 0,
          bounds: el.getBoundingClientRect(),
          textContent: el.textContent.trim().substring(0, 100)
        }))
      });

      // Strategy 2: Look for custom elements (lit-element)
      const customElements = document.querySelectorAll('onboarding-view, welcome-view');
      searches.push({
        strategy: 'custom elements',
        count: customElements.length,
        elements: Array.from(customElements).map(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          visible: el.offsetWidth > 0 && el.offsetHeight > 0,
          bounds: el.getBoundingClientRect(),
          shadowRoot: el.shadowRoot ? 'present' : 'none'
        }))
      });

      // Strategy 3: Look for any visible containers that might be onboarding
      const containers = document.querySelectorAll('div, section, main');
      const potentialOnboarding = Array.from(containers).filter(el => {
        const rect = el.getBoundingClientRect();
        const text = el.textContent.toLowerCase();
        return rect.width > 300 && rect.height > 400 && 
               (text.includes('welcome') || text.includes('setup') || text.includes('get started'));
      });

      searches.push({
        strategy: 'potential onboarding containers',
        count: potentialOnboarding.length,
        elements: potentialOnboarding.map(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          bounds: el.getBoundingClientRect(),
          textContent: el.textContent.trim().substring(0, 200)
        }))
      });

      return searches;
    });

    console.log('🎯 Onboarding search results:');
    onboardingSearch.forEach((search, index) => {
      console.log(`  ${index + 1}. ${search.strategy}: ${search.count} elements found`);
      search.elements.forEach((el, i) => {
        console.log(`     ${i + 1}. ${el.tagName}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ').join('.') : ''}`);
        console.log(`        Visible: ${el.visible}, Bounds: ${JSON.stringify(el.bounds)}`);
        if (el.textContent) {
          console.log(`        Text: "${el.textContent}"`);
        }
      });
    });

    // Check for window manager and related functionality
    console.log('🪟 Checking window manager...');
    const windowManagerInfo = await window.evaluate(() => {
      const info = {
        windowManager: !!window.windowManager,
        availableFunctions: [],
        electronAPI: !!window.electronAPI,
        ipcRenderer: !!window.ipcRenderer
      };

      if (window.windowManager) {
        info.availableFunctions = Object.getOwnPropertyNames(window.windowManager);
      }

      // Check for any global onboarding functions
      const globalFunctions = [];
      for (let prop in window) {
        if (prop.toLowerCase().includes('onboard') || prop.toLowerCase().includes('welcome')) {
          globalFunctions.push(prop);
        }
      }
      info.onboardingFunctions = globalFunctions;

      return info;
    });

    console.log('🔧 Window manager info:', windowManagerInfo);

    // Try to access DOM more deeply
    const domStructure = await window.evaluate(() => {
      const getElementInfo = (element, maxDepth = 3, currentDepth = 0) => {
        if (currentDepth >= maxDepth) return null;
        
        const info = {
          tagName: element.tagName,
          className: element.className,
          id: element.id,
          visible: element.offsetWidth > 0 && element.offsetHeight > 0,
          children: []
        };

        if (element.children.length > 0 && currentDepth < maxDepth) {
          for (let child of element.children) {
            const childInfo = getElementInfo(child, maxDepth, currentDepth + 1);
            if (childInfo) {
              info.children.push(childInfo);
            }
          }
        }

        return info;
      };

      return getElementInfo(document.body, 2);
    });

    console.log('🏗️ DOM structure (2 levels):');
    console.log(JSON.stringify(domStructure, null, 2));

    // Try to trigger onboarding manually
    console.log('🎯 Attempting to trigger onboarding...');
    const triggerResults = await window.evaluate(() => {
      const results = [];

      // Try window manager if available
      if (window.windowManager && window.windowManager.setWindowVisibility) {
        try {
          window.windowManager.setWindowVisibility({
            name: 'settings',
            shouldBeVisible: true,
            component: 'OnboardingTest'
          });
          results.push('✅ windowManager.setWindowVisibility called for settings');
        } catch (e) {
          results.push(`❌ windowManager.setWindowVisibility failed: ${e.message}`);
        }
      }

      // Try IPC if available
      if (window.electronAPI && window.electronAPI.send) {
        try {
          window.electronAPI.send('show-onboarding');
          results.push('✅ electronAPI.send("show-onboarding") called');
        } catch (e) {
          results.push(`❌ electronAPI.send failed: ${e.message}`);
        }
      }

      return results;
    });

    console.log('🚀 Trigger results:');
    triggerResults.forEach(result => console.log(`  ${result}`));

    // Wait and take another screenshot
    await window.waitForTimeout(2000);
    await window.screenshot({ 
      path: 'test-results/after-trigger.png',
      fullPage: true 
    });

    // Check what actually changed
    const postTriggerState = await window.evaluate(() => {
      const onboardingElements = document.querySelectorAll('[class*="onboarding"], [id*="onboarding"], onboarding-view');
      return Array.from(onboardingElements).map(el => ({
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        visible: el.offsetWidth > 0 && el.offsetHeight > 0,
        bounds: el.getBoundingClientRect(),
        display: window.getComputedStyle(el).display,
        visibility: window.getComputedStyle(el).visibility,
        opacity: window.getComputedStyle(el).opacity
      }));
    });

    console.log('📊 Post-trigger onboarding elements:');
    postTriggerState.forEach((el, i) => {
      console.log(`  ${i + 1}. ${el.tagName}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className : ''}`);
      console.log(`     Visible: ${el.visible}, Display: ${el.display}, Visibility: ${el.visibility}, Opacity: ${el.opacity}`);
      console.log(`     Bounds: ${JSON.stringify(el.bounds)}`);
    });

    console.log('✅ Investigation complete!');
    console.log('📁 Screenshots saved to test-results/ directory');

  } catch (error) {
    console.error('❌ Error during investigation:', error);
  } finally {
    if (electronApp) {
      await electronApp.close();
      console.log('🔚 Electron app closed');
    }
  }
}

// Run the investigation
investigateOnboarding().catch(console.error);
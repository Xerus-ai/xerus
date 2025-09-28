const { chromium } = require('playwright');
const path = require('path');

async function runUITest() {
    console.log('🚀 Starting UI visibility analysis with Playwright...');
    
    const browser = await chromium.launch({ 
        headless: false,
        devtools: true 
    });
    
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Enable console logging
        page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));
        page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`));
        
        // Test the component loading file first
        const testFilePath = path.join(__dirname, 'test-component-loading.html');
        console.log(`📂 Loading test file: ${testFilePath}`);
        
        await page.goto(`file://${testFilePath}`);
        await page.waitForTimeout(3000);
        
        // Take screenshot
        await page.screenshot({ 
            path: 'test-results/component-test.png',
            fullPage: true 
        });
        
        // Get test results
        const testResults = await page.evaluate(() => {
            return {
                componentStatus: document.getElementById('component-status')?.textContent || 'Not found',
                headerDebug: document.getElementById('header-debug')?.textContent || 'Not found',
                moduleStatus: document.getElementById('module-status')?.textContent || 'Not found',
                envInfo: document.getElementById('env-info')?.textContent || 'Not found'
            };
        });
        
        console.log('📊 Component Test Results:');
        console.log('Component Status:', testResults.componentStatus);
        console.log('Header Debug:', testResults.headerDebug);
        console.log('Module Status:', testResults.moduleStatus);
        console.log('Environment:', testResults.envInfo);
        
        // Now test the actual Electron app if possible
        console.log('\n🔍 Testing actual header.html file...');
        
        const headerPath = path.join(__dirname, 'src', 'ui', 'app', 'header.html');
        await page.goto(`file://${headerPath}`);
        await page.waitForTimeout(5000); // Wait longer for modules to load
        
        // Take screenshot of header
        await page.screenshot({ 
            path: 'test-results/header-test.png',
            fullPage: true 
        });
        
        // Analyze header page
        const headerResults = await page.evaluate(() => {
            const container = document.getElementById('header-container');
            const mainHeader = document.querySelector('main-header');
            
            return {
                containerExists: Boolean(container),
                containerContent: container ? container.innerHTML.substring(0, 200) + '...' : 'Not found',
                mainHeaderExists: Boolean(mainHeader),
                mainHeaderVisible: mainHeader ? (mainHeader.offsetWidth > 0 && mainHeader.offsetHeight > 0) : false,
                customElementDefined: Boolean(customElements.get('main-header')),
                bodyClasses: document.body.className,
                hasGlass: document.body.classList.contains('has-glass'),
                windowSize: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            };
        });
        
        console.log('\n📊 Header Test Results:');
        Object.entries(headerResults).forEach(([key, value]) => {
            console.log(`${key}:`, value);
        });
        
        // Test with glass mode enabled
        console.log('\n🔧 Testing with glass mode enabled...');
        await page.goto(`file://${headerPath}?glass=true`);
        await page.waitForTimeout(3000);
        
        await page.screenshot({ 
            path: 'test-results/header-glass-mode.png',
            fullPage: true 
        });
        
        // Get glass mode results
        const glassResults = await page.evaluate(() => {
            return {
                hasGlassClass: document.body.classList.contains('has-glass'),
                containerHTML: document.getElementById('header-container')?.innerHTML.substring(0, 300) || 'Not found'
            };
        });
        
        console.log('\n🔧 Glass Mode Results:');
        console.log('Has glass class:', glassResults.hasGlassClass);
        console.log('Container content:', glassResults.containerHTML);
        
        console.log('\n✅ UI analysis complete! Check test-results/ folder for screenshots.');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await browser.close();
    }
}

runUITest().catch(console.error);
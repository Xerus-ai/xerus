/**
 * Debug script to test folder creation functionality
 * This will help identify why folders aren't showing up in screenshots
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function debugFolderCreation() {
    console.log('🔧 Debug: Testing folder creation functionality...');
    
    const browser = await chromium.launch({ 
        headless: false,
        devtools: true,
        timeout: 30000
    });
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 }
        });
        const page = await context.newPage();
        
        // Enable detailed console logging
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            console.log(`📄 [${type.toUpperCase()}] ${text}`);
        });
        
        page.on('pageerror', error => console.error(`❌ [PAGE ERROR] ${error.message}`));
        
        // Enable network monitoring
        page.on('response', response => {
            const status = response.status();
            const url = response.url();
            if (url.includes('/knowledge/folders')) {
                console.log(`📡 [NETWORK] ${response.request().method()} ${url} - ${status}`);
            }
        });
        
        // Create debug results directory
        const debugDir = path.join(__dirname, '..', '..', 'test-results', 'debug-folder-creation');
        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
        }
        
        // Navigate to Knowledge Base
        console.log('🔗 Navigating to Knowledge Base...');
        await page.goto('http://localhost:3000/knowledge-base');
        await page.waitForLoadState('networkidle');
        
        // Take initial screenshot
        await page.screenshot({ 
            path: path.join(debugDir, '01-initial-state.png'),
            fullPage: true 
        });
        
        // Check authentication state
        console.log('🔍 Checking authentication state...');
        const isAuthenticated = await page.isVisible('text=New Folder') || 
                               await page.isVisible('button:has-text("New Folder")');
        const needsAuth = await page.isVisible('text=Please sign in') || 
                          await page.isVisible('text=Sign in to access');
        
        console.log(`   Authentication status: ${isAuthenticated ? 'Authenticated' : 'Not authenticated'}`);
        console.log(`   Needs auth: ${needsAuth}`);
        
        if (needsAuth) {
            console.log('⚠️ Authentication required. Please sign in manually and retry.');
            console.log('💡 Or test with a pre-authenticated session');
            
            await page.screenshot({ 
                path: path.join(debugDir, '02-needs-auth.png'),
                fullPage: true 
            });
            
            return;
        }
        
        if (!isAuthenticated) {
            console.log('⚠️ Authentication state unclear. Proceeding with test...');
        }
        
        // Look for existing folders first
        console.log('📂 Checking for existing folders...');
        const existingFolders = await page.locator('[data-testid="folder-card"], .folder-card, [class*="folder"]').all();
        console.log(`   Found ${existingFolders.length} existing folders`);
        
        // Try to find New Folder button with various selectors
        console.log('🔍 Looking for New Folder button...');
        const newFolderSelectors = [
            'text=New Folder',
            'button:has-text("New Folder")',
            '[data-testid="new-folder-button"]',
            'button:has-text("Create")',
            'button:has-text("Add Folder")'
        ];
        
        let newFolderButton = null;
        for (const selector of newFolderSelectors) {
            try {
                if (await page.isVisible(selector)) {
                    newFolderButton = selector;
                    console.log(`   ✅ Found New Folder button: ${selector}`);
                    break;
                }
            } catch (error) {
                // Continue to next selector
            }
        }
        
        if (!newFolderButton) {
            console.log('❌ New Folder button not found');
            
            // Take screenshot of current state
            await page.screenshot({ 
                path: path.join(debugDir, '03-no-button-found.png'),
                fullPage: true 
            });
            
            // Try to inspect the page structure
            console.log('🔍 Inspecting page structure...');
            const buttons = await page.locator('button').all();
            console.log(`   Found ${buttons.length} buttons on page`);
            
            for (let i = 0; i < Math.min(buttons.length, 10); i++) {
                try {
                    const text = await buttons[i].textContent();
                    console.log(`   Button ${i}: "${text}"`);
                } catch (error) {
                    console.log(`   Button ${i}: (could not read text)`);
                }
            }
            
            return;
        }
        
        // Click New Folder button
        console.log('📁 Clicking New Folder button...');
        await page.click(newFolderButton);
        await page.waitForTimeout(1000);
        
        // Take screenshot after clicking
        await page.screenshot({ 
            path: path.join(debugDir, '04-after-button-click.png'),
            fullPage: true 
        });
        
        // Look for dialog
        console.log('🔍 Looking for folder creation dialog...');
        const dialogSelectors = [
            'text=Create New Folder',
            'text=New Folder',
            '[role="dialog"]',
            '.modal',
            '.dialog'
        ];
        
        let dialogVisible = false;
        for (const selector of dialogSelectors) {
            if (await page.isVisible(selector)) {
                console.log(`   ✅ Dialog found: ${selector}`);
                dialogVisible = true;
                break;
            }
        }
        
        if (!dialogVisible) {
            console.log('❌ No dialog appeared after clicking New Folder button');
            return;
        }
        
        // Find folder name input
        console.log('📝 Looking for folder name input...');
        const inputSelectors = [
            'input[placeholder*="folder name" i]',
            'input[placeholder*="name" i]',
            'input[type="text"]',
            'input:first-of-type'
        ];
        
        let nameInput = null;
        for (const selector of inputSelectors) {
            try {
                if (await page.isVisible(selector)) {
                    nameInput = selector;
                    console.log(`   ✅ Found name input: ${selector}`);
                    break;
                }
            } catch (error) {
                // Continue to next selector
            }
        }
        
        if (!nameInput) {
            console.log('❌ Folder name input not found');
            return;
        }
        
        // Enter folder name
        const testFolderName = 'Debug Test Folder ' + Date.now();
        console.log(`📝 Entering folder name: ${testFolderName}`);
        await page.fill(nameInput, testFolderName);
        await page.waitForTimeout(500);
        
        // Verify the input value was set correctly
        const inputValue = await page.inputValue(nameInput);
        console.log(`   📋 Input value after filling: "${inputValue}"`);
        
        // Trigger any onChange handlers by dispatching input event
        await page.dispatchEvent(nameInput, 'input');
        await page.waitForTimeout(100);
        
        // Take screenshot with name entered
        await page.screenshot({ 
            path: path.join(debugDir, '05-name-entered.png'),
            fullPage: true 
        });
        
        // Find and click Create button (the one in the dialog, not "Create Folder")
        console.log('✅ Looking for Create button in dialog...');
        const createSelectors = [
            'button:has-text("Create"):not(:has-text("Folder"))', // "Create" but not "Create Folder"
            'div[role="dialog"] button:has-text("Create")',
            '.modal button:has-text("Create")',
            'button:has-text("Creating")',
            'button[type="submit"]'
        ];
        
        let createButton = null;
        for (const selector of createSelectors) {
            try {
                if (await page.isVisible(selector)) {
                    // Check if button is disabled
                    const isDisabled = await page.isDisabled(selector);
                    console.log(`   🔍 Found button "${selector}" - disabled: ${isDisabled}`);
                    if (!isDisabled) {
                        createButton = selector;
                        console.log(`   ✅ Found enabled Create button: ${selector}`);
                        
                        // Debug: Check button attributes and state
                        const buttonText = await page.textContent(selector);
                        const buttonClass = await page.getAttribute(selector, 'class');
                        console.log(`   📋 Button text: "${buttonText}"`);
                        console.log(`   🎨 Button classes: ${buttonClass}`);
                        
                        break;
                    }
                }
            } catch (error) {
                // Continue to next selector
            }
        }
        
        if (!createButton) {
            console.log('❌ No enabled Create button found');
            
            // Debug: list all buttons in the dialog area
            console.log('🔍 Debugging: All buttons in dialog...');
            const allButtons = await page.locator('button').all();
            for (let i = 0; i < allButtons.length; i++) {
                try {
                    const text = await allButtons[i].textContent();
                    const isVisible = await allButtons[i].isVisible();
                    const isDisabled = await allButtons[i].isDisabled();
                    if (isVisible) {
                        console.log(`   Button ${i}: "${text}" (visible: ${isVisible}, disabled: ${isDisabled})`);
                    }
                } catch (error) {
                    // Skip buttons we can't read
                }
            }
            
            return;
        }
        
        // Click Create button and monitor network
        console.log('🚀 Clicking Create button...');
        
        // Set up network response listener before clicking
        const folderCreationPromise = page.waitForResponse(response => 
            response.url().includes('/knowledge/folders') && 
            response.request().method() === 'POST',
            { timeout: 10000 }
        ).catch(() => null);
        
        // Try multiple click approaches to handle UI overlay issues
        let clickSuccessful = false;
        
        // Method 1: Direct click
        try {
            await page.click(createButton, { timeout: 5000 });
            clickSuccessful = true;
            console.log('   ✅ Direct click successful');
        } catch (error) {
            console.log('   ⚠️ Direct click failed, trying force click...');
            
            // Method 2: Force click (ignores overlays)
            try {
                await page.click(createButton, { force: true, timeout: 5000 });
                clickSuccessful = true;
                console.log('   ✅ Force click successful');
            } catch (error2) {
                console.log('   ⚠️ Force click failed, trying Enter key...');
                
                // Method 3: Press Enter key (since we know it's supposed to work)
                try {
                    await page.press(nameInput, 'Enter');
                    clickSuccessful = true;
                    console.log('   ✅ Enter key press successful');
                } catch (error3) {
                    console.log('   ❌ All click methods failed:', error3.message);
                }
            }
        }
        
        // Wait for network response and console logs
        console.log('⏳ Waiting for folder creation response...');
        
        // Also listen for specific console messages about folder creation
        let folderCreationStarted = false;
        let folderCreationError = null;
        let folderCreationSuccess = false;
        
        const consoleListener = (msg) => {
            const text = msg.text();
            if (text.includes('API Call: POST') && text.includes('/knowledge/folders')) {
                folderCreationStarted = true;
                console.log('   🚀 Folder creation API call started');
            }
            if (text.includes('Folder created successfully')) {
                folderCreationSuccess = true;
                console.log('   ✅ Folder creation success detected in console');
            }
            if (text.includes('Failed to create folder')) {
                folderCreationError = text;
                console.log('   ❌ Folder creation error detected in console');
            }
        };
        
        page.on('console', consoleListener);
        
        // Wait a bit for the async operation
        await page.waitForTimeout(5000);
        
        page.off('console', consoleListener);
        
        const response = await folderCreationPromise;
        
        // Report on the async operation status
        console.log(`   📊 Folder creation status:`);
        console.log(`      - API call started: ${folderCreationStarted}`);
        console.log(`      - Success detected: ${folderCreationSuccess}`);
        console.log(`      - Error detected: ${folderCreationError ? 'Yes' : 'No'}`);
        if (folderCreationError) {
            console.log(`      - Error details: ${folderCreationError}`);
        }
        
        if (response) {
            const status = response.status();
            console.log(`📡 Folder creation response: ${status}`);
            
            if (status === 201) {
                console.log('✅ Folder creation successful (201 Created)');
            } else {
                console.log(`❌ Folder creation failed with status: ${status}`);
                try {
                    const responseBody = await response.json();
                    console.log('📄 Response body:', JSON.stringify(responseBody, null, 2));
                } catch (error) {
                    console.log('❌ Could not parse response body');
                }
            }
        } else {
            console.log('❌ No network response received for folder creation');
        }
        
        // Wait for UI to update
        await page.waitForTimeout(2000);
        
        // Take screenshot after creation attempt
        await page.screenshot({ 
            path: path.join(debugDir, '06-after-creation.png'),
            fullPage: true 
        });
        
        // Check if folder appears in UI
        console.log('🔍 Checking if folder appears in UI...');
        const folderAppeared = await page.isVisible(`text=${testFolderName}`) ||
                               await page.locator(`text=${testFolderName}`).count() > 0;
        
        console.log(`   Folder visible: ${folderAppeared}`);
        
        if (folderAppeared) {
            console.log('✅ Folder creation successful and visible in UI');
        } else {
            console.log('❌ Folder not visible in UI after creation');
            
            // Check all folders again
            const allFolders = await page.locator('[data-testid="folder-card"], .folder-card, [class*="folder"]').all();
            console.log(`   Total folders now: ${allFolders.length}`);
            
            // List all text on page to see if folder is there with different selector
            const pageText = await page.textContent('body');
            if (pageText.includes(testFolderName)) {
                console.log('💡 Folder name found in page text but not with expected selector');
            } else {
                console.log('❌ Folder name not found anywhere on page');
            }
        }
        
        // Final screenshot
        await page.screenshot({ 
            path: path.join(debugDir, '07-final-state.png'),
            fullPage: true 
        });
        
        console.log(`\n📸 Debug screenshots saved to: ${debugDir}`);
        console.log('🔍 Review screenshots to identify UI state issues');
        
    } catch (error) {
        console.error('❌ Debug test failed:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

// Run debug test
if (require.main === module) {
    debugFolderCreation()
        .then(() => {
            console.log('\n✅ Debug test completed');
            console.log('📋 Review the screenshots and console output to identify issues');
        })
        .catch(error => {
            console.error('💥 Debug test failed:', error);
            process.exit(1);
        });
}
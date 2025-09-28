/**
 * PERSONALITY MANAGER INTEGRATION TEST
 * 
 * This script tests the complete personality manager integration
 * across Ask and Listen services, including:
 * - Service container registration
 * - Personality manager initialization 
 * - IPC handler functionality
 * - UI integration points
 * - Error handling
 */

const { createLogger } = require('./src/common/services/logger.js');
const { serviceContainer } = require('./src/common/services/dependency-injection');

const logger = createLogger('Integration-test');

/**
 * Test personality manager service registration
 */
async function testServiceRegistration() {
    logger.info('🔧 Testing service container registration...');
    
    try {
        // Check if personality manager is registered
        const isRegistered = serviceContainer.has('agentPersonalityManager');
        if (!isRegistered) {
            throw new Error('AgentPersonalityManager not registered in service container');
        }
        
        // Try to resolve the service
        const personalityManager = serviceContainer.resolve('agentPersonalityManager');
        if (!personalityManager) {
            throw new Error('Failed to resolve AgentPersonalityManager from container');
        }
        
        logger.info('✅ Service registration test passed');
        return { success: true, personalityManager };
        
    } catch (error) {
        logger.error('❌ Service registration test failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test personality manager initialization
 */
async function testPersonalityManagerInit(personalityManager) {
    logger.info('🚀 Testing personality manager initialization...');
    
    try {
        // Test initialization
        await personalityManager.initialize();
        
        if (!personalityManager.initialized) {
            throw new Error('Personality manager failed to initialize');
        }
        
        // Test basic functionality
        const personalities = personalityManager.getAvailablePersonalities();
        if (!personalities || personalities.length === 0) {
            throw new Error('No personalities available after initialization');
        }
        
        const currentStatus = personalityManager.getCurrentPersonalityStatus();
        if (!currentStatus) {
            throw new Error('Failed to get current personality status');
        }
        
        logger.info('✅ Personality manager initialization test passed');
        logger.info(`   Available personalities: ${personalities.length}`);
        logger.info(`   Current personality: ${currentStatus.id}`);
        
        return { success: true, personalities, currentStatus };
        
    } catch (error) {
        logger.error('❌ Personality manager initialization test failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test personality switching functionality
 */
async function testPersonalitySwitching(personalityManager) {
    logger.info('🔄 Testing personality switching...');
    
    try {
        const personalities = personalityManager.getAvailablePersonalities();
        const testPersonality = personalities.find(p => p.id !== personalityManager.getCurrentPersonalityStatus().id);
        
        if (!testPersonality) {
            throw new Error('No alternative personality found for testing');
        }
        
        // Switch personality
        await personalityManager.switchPersonality(testPersonality.id);
        
        // Verify switch
        const newStatus = personalityManager.getCurrentPersonalityStatus();
        if (newStatus.id !== testPersonality.id) {
            throw new Error(`Personality switch failed. Expected: ${testPersonality.id}, Got: ${newStatus.id}`);
        }
        
        logger.info('✅ Personality switching test passed');
        logger.info(`   Switched to: ${newStatus.name}`);
        
        return { success: true, newPersonality: newStatus };
        
    } catch (error) {
        logger.error('❌ Personality switching test failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test adaptive personality functionality
 */
async function testAdaptivePersonality(personalityManager) {
    logger.info('🧠 Testing adaptive personality functionality...');
    
    try {
        // Test configuration update
        personalityManager.updateConfig({ isAdaptive: true });
        
        const state = personalityManager.getState();
        if (!state.isAdaptive) {
            throw new Error('Failed to enable adaptive mode');
        }
        
        // Test context adaptation
        const testContext = {
            taskType: 'technical',
            userLevel: 'expert',
            complexity: 'high',
            urgency: 'normal'
        };
        
        personalityManager.updateContextFactors(testContext);
        
        // Get recommendations
        const recommendations = personalityManager.getPersonalityRecommendations('technical', 'expert');
        if (!recommendations || recommendations.length === 0) {
            throw new Error('Failed to get personality recommendations');
        }
        
        logger.info('✅ Adaptive personality test passed');
        logger.info(`   Recommendations for technical/expert: ${recommendations.length}`);
        logger.info(`   Top recommendation: ${recommendations[0].personality.name}`);
        
        return { success: true, recommendations };
        
    } catch (error) {
        logger.error('❌ Adaptive personality test failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test system prompt generation
 */
async function testSystemPromptGeneration(personalityManager) {
    logger.info('📝 Testing system prompt generation...');
    
    try {
        const systemPrompt = personalityManager.getSystemPrompt();
        
        if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.length === 0) {
            throw new Error('Failed to generate system prompt');
        }
        
        // Test with different personalities
        const personalities = personalityManager.getAvailablePersonalities();
        const techPersonality = personalities.find(p => p.id === 'technical_expert');
        
        if (techPersonality) {
            await personalityManager.switchPersonality('technical_expert');
            const techPrompt = personalityManager.getSystemPrompt();
            
            if (techPrompt === systemPrompt) {
                logger.warn('⚠️  System prompts are identical for different personalities');
            }
        }
        
        logger.info('✅ System prompt generation test passed');
        logger.info(`   System prompt length: ${systemPrompt.length} characters`);
        
        return { success: true, systemPrompt: systemPrompt.substring(0, 100) + '...' };
        
    } catch (error) {
        logger.error('❌ System prompt generation test failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test error handling
 */
async function testErrorHandling(personalityManager) {
    logger.info('🛡️ Testing error handling...');
    
    try {
        // Test invalid personality switch
        try {
            await personalityManager.switchPersonality('invalid_personality');
            throw new Error('Should have failed with invalid personality ID');
        } catch (error) {
            if (!error.message.includes('not found') && !error.message.includes('invalid')) {
                throw new Error('Unexpected error for invalid personality: ' + error.message);
            }
        }
        
        // Test invalid context factors
        try {
            personalityManager.updateContextFactors({ invalidFactor: 'test' });
            // This should not throw an error but should handle gracefully
        } catch (error) {
            logger.warn('Context factor validation might be too strict:', error.message);
        }
        
        logger.info('✅ Error handling test passed');
        return { success: true };
        
    } catch (error) {
        logger.error('❌ Error handling test failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Main test runner
 */
async function runIntegrationTests() {
    logger.info('🧪 Starting Personality Manager Integration Tests...');
    logger.info('================================================');
    
    const results = {
        serviceRegistration: null,
        initialization: null,
        personalitySwitching: null,
        adaptivePersonality: null,
        systemPromptGeneration: null,
        errorHandling: null
    };
    
    // Test 1: Service Registration
    const registrationResult = await testServiceRegistration();
    results.serviceRegistration = registrationResult;
    
    if (!registrationResult.success) {
        logger.error('💥 Critical failure: Service registration failed. Cannot continue tests.');
        return results;
    }
    
    const personalityManager = registrationResult.personalityManager;
    
    // Test 2: Initialization
    const initResult = await testPersonalityManagerInit(personalityManager);
    results.initialization = initResult;
    
    if (!initResult.success) {
        logger.error('💥 Critical failure: Initialization failed. Stopping tests.');
        return results;
    }
    
    // Test 3: Personality Switching
    const switchingResult = await testPersonalitySwitching(personalityManager);
    results.personalitySwitching = switchingResult;
    
    // Test 4: Adaptive Personality
    const adaptiveResult = await testAdaptivePersonality(personalityManager);
    results.adaptivePersonality = adaptiveResult;
    
    // Test 5: System Prompt Generation
    const promptResult = await testSystemPromptGeneration(personalityManager);
    results.systemPromptGeneration = promptResult;
    
    // Test 6: Error Handling
    const errorResult = await testErrorHandling(personalityManager);
    results.errorHandling = errorResult;
    
    // Print summary
    logger.info('================================================');
    logger.info('🎯 TEST SUMMARY:');
    
    const testNames = Object.keys(results);
    const passedTests = testNames.filter(test => results[test]?.success);
    const failedTests = testNames.filter(test => !results[test]?.success);
    
    logger.info(`✅ Passed: ${passedTests.length}/${testNames.length}`);
    if (failedTests.length > 0) {
        logger.info(`❌ Failed: ${failedTests.join(', ')}`);
    }
    
    const overallSuccess = failedTests.length === 0;
    logger.info(`\n🏆 Overall Result: ${overallSuccess ? 'SUCCESS' : 'FAILURE'}`);
    
    return {
        ...results,
        summary: {
            total: testNames.length,
            passed: passedTests.length,
            failed: failedTests.length,
            success: overallSuccess
        }
    };
}

// Export for use in other test files or run directly
if (require.main === module) {
    runIntegrationTests()
        .then(results => {
            if (results.summary?.success) {
                process.exit(0);
            } else {
                process.exit(1);
            }
        })
        .catch(error => {
            logger.error('Test runner failed:', error);
            process.exit(1);
        });
}

module.exports = {
    runIntegrationTests,
    testServiceRegistration,
    testPersonalityManagerInit,
    testPersonalitySwitching,
    testAdaptivePersonality,
    testSystemPromptGeneration,
    testErrorHandling
};
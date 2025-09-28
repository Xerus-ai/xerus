/**
 * Frontend-Backend Integration Test
 * Tests if frontend can connect to new backend service
 * Integration Agent 🔄 - Validating End-to-End Connection
 */

const fetch = require('node-fetch');

// Configuration
const BACKEND_BASE_URL = 'http://localhost:5001/api/v1';
const WEB_DASHBOARD_URL = 'http://localhost:3000';

// Test headers (simulating frontend)
const getTestHeaders = () => ({
  'Content-Type': 'application/json',
  'X-User-ID': 'integration_test_user',
  'User-Agent': 'Glass-Integration-Test'
});

// Test functions
async function testBackendHealth() {
  console.log('🔍 Testing backend health...');
  try {
    const response = await fetch('http://localhost:5001/health');
    const data = await response.json();
    console.log('✅ Backend health:', data.status);
    return data.status === 'healthy';
  } catch (error) {
    console.error('❌ Backend health failed:', error.message);
    return false;
  }
}

async function testAgentsAPI() {
  console.log('🔍 Testing agents API...');
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/agents`, {
      headers: getTestHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const agents = await response.json();
    console.log(`✅ Agents API: Retrieved ${agents.length} agents`);
    console.log(`   Agent examples: ${agents.slice(0, 2).map(a => a.name).join(', ')}`);
    return agents.length > 0;
  } catch (error) {
    console.error('❌ Agents API failed:', error.message);
    return false;
  }
}

async function testKnowledgeAPI() {
  console.log('🔍 Testing knowledge API...');
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/knowledge`, {
      headers: getTestHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const knowledge = await response.json();
    console.log(`✅ Knowledge API: Retrieved ${knowledge.length} documents`);
    return Array.isArray(knowledge);
  } catch (error) {
    console.error('❌ Knowledge API failed:', error.message);
    return false;
  }
}

async function testToolsAPI() {
  console.log('🔍 Testing tools API...');
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/tools`, {
      headers: getTestHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const tools = await response.json();
    console.log(`✅ Tools API: Retrieved ${tools.length} tools`);
    return Array.isArray(tools);
  } catch (error) {
    console.error('❌ Tools API failed:', error.message);
    return false;
  }
}

async function testRuntimeConfig() {
  console.log('🔍 Testing runtime configuration...');
  try {
    const response = await fetch(`${WEB_DASHBOARD_URL}/runtime-config.json`);
    
    if (!response.ok) {
      throw new Error(`Runtime config responded with status: ${response.status}`);
    }
    
    const config = await response.json();
    console.log('✅ Runtime config:', config);
    
    const expectedApiUrl = 'http://localhost:5001/api/v1';
    if (config.API_URL !== expectedApiUrl) {
      console.warn(`⚠️ API_URL mismatch: expected ${expectedApiUrl}, got ${config.API_URL}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Runtime config failed:', error.message);
    return false;
  }
}

// Main integration test
async function runIntegrationTest() {
  console.log('\n🚀 GLASS FRONTEND-BACKEND INTEGRATION TEST');
  console.log('==========================================\n');
  
  const results = {
    backendHealth: false,
    runtimeConfig: false,
    agentsAPI: false,
    knowledgeAPI: false,
    toolsAPI: false
  };
  
  // Run tests
  results.backendHealth = await testBackendHealth();
  results.runtimeConfig = await testRuntimeConfig();
  results.agentsAPI = await testAgentsAPI();
  results.knowledgeAPI = await testKnowledgeAPI();
  results.toolsAPI = await testToolsAPI();
  
  // Summary
  console.log('\n📊 INTEGRATION TEST RESULTS');
  console.log('============================');
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, result]) => {
    const status = result ? '✅' : '❌';
    console.log(`${status} ${test}: ${result ? 'PASSED' : 'FAILED'}`);
  });
  
  console.log(`\n🎯 Overall Result: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 INTEGRATION SUCCESSFUL! Frontend can connect to backend.');
    console.log('✅ Ready for end-to-end testing in web dashboard.');
  } else {
    console.log('🚨 INTEGRATION ISSUES DETECTED! Some tests failed.');
    console.log('❌ Manual investigation required.');
  }
  
  console.log('\n🔧 Next Steps:');
  console.log('1. Open http://localhost:3000/ai-agents in browser');
  console.log('2. Verify agents load correctly');
  console.log('3. Test CRUD operations');
  console.log('4. Validate authentication flow\n');
  
  return passed === total;
}

// Run the test
if (require.main === module) {
  runIntegrationTest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Integration test crashed:', error);
      process.exit(1);
    });
}

module.exports = { runIntegrationTest };
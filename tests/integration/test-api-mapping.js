/**
 * API Mapping Verification Script
 * Tests that frontend API calls map correctly to new backend endpoints
 */

const axios = require('axios');

// Configuration
const FRONTEND_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://localhost:5001';
const TEST_USER_ID = 'test_user_123';

// API endpoint mappings
const API_MAPPINGS = [
  {
    name: 'Get Agents',
    frontend: '/api/agents',
    backend: '/api/v1/agents',
    method: 'GET'
  },
  {
    name: 'Get Knowledge',
    frontend: '/api/knowledge', 
    backend: '/api/v1/knowledge',
    method: 'GET'
  },
  {
    name: 'Get Tools',
    frontend: '/api/tools',
    backend: '/api/v1/tools', 
    method: 'GET'
  }
];

// Test function
async function testAPIMapping() {
  console.log('🔍 API MAPPING VERIFICATION');
  console.log('===========================\n');

  const results = [];

  for (const mapping of API_MAPPINGS) {
    console.log(`Testing: ${mapping.name}`);
    
    try {
      // Test backend directly
      const backendResponse = await axios({
        method: mapping.method,
        url: `${BACKEND_URL}${mapping.backend}`,
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ Backend ${mapping.backend}: ${backendResponse.status} - ${
        Array.isArray(backendResponse.data) ? 
        `${backendResponse.data.length} items` : 
        'Response received'
      }`);

      results.push({
        endpoint: mapping.name,
        backend: 'PASS',
        status: backendResponse.status,
        itemCount: Array.isArray(backendResponse.data) ? backendResponse.data.length : 'N/A'
      });

    } catch (error) {
      console.error(`❌ Backend ${mapping.backend}: ${error.message}`);
      results.push({
        endpoint: mapping.name,
        backend: 'FAIL',
        error: error.message
      });
    }

    console.log('---');
  }

  // Summary
  console.log('\n📊 SUMMARY');
  console.log('==========');
  console.table(results);

  const allPassed = results.every(r => r.backend === 'PASS');
  console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${
    allPassed ? 'All endpoints working!' : 'Some endpoints failed'
  }`);

  // Check if old backend endpoints are still accessible
  console.log('\n🔍 Checking for old backend remnants...');
  try {
    await axios.get(`${FRONTEND_URL}/api/agents`);
    console.log('⚠️  WARNING: Old /api/agents endpoint still accessible!');
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('✅ Old /api/agents endpoint properly removed');
    } else {
      console.log('❓ Old /api/agents endpoint status unclear:', error.message);
    }
  }
}

// Run the test
testAPIMapping().catch(console.error);
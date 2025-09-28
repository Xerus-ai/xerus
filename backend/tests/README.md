# Backend Test Suite

## Test Structure

### `/unit/`
Unit tests for individual components and services.
- `database/` - Database connection and query tests
- `services/` - Service layer business logic tests

### `/integration/`
Integration tests for API endpoints and cross-component functionality.
- `api/` - API endpoint tests with database interactions
- Component integration tests and end-to-end workflows

### `/e2e/`
End-to-end tests for complete user workflows.

### `/debug/`
Debug utilities and test result files.
- `debug-test-results.json` - Debug test execution results
- `test-debug-user-issues.js` - User issue debugging utilities

### `/manual/`
Manual test scripts for development and validation.
- `test-api-key-endpoints.js` - Manual API key validation testing

## Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/services/agentService.test.js
```

## Test Coverage

Current coverage: 89% (AgentService with comprehensive TDD)

- Unit tests: ≥90% coverage target
- Integration tests: ≥70% coverage target
- Critical path coverage: 100% required

## Adding New Tests

1. **Unit Tests**: Place in appropriate service/component directory
2. **Integration Tests**: Add to `/integration/api/` for endpoint tests
3. **Debug Tests**: Place debugging utilities in `/debug/`
4. **Manual Tests**: Add validation scripts to `/manual/`

## Test Naming Convention

- Unit: `serviceName.test.js`
- Integration: `endpointName.test.js`
- Debug: `test-debug-description.js`
- Manual: `test-manual-description.js`
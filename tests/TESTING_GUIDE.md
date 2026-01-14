# Testing Guide

## Overview

This project now includes a comprehensive unit test suite using Jest. The tests cover critical authentication, authorization, and API functionality.

## Quick Start

### Install Dependencies
```bash
npm install
```

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run only unit tests
npm run test:unit
```

## Test Structure

```
tests/
├── setup.js                    # Jest configuration and global setup
├── helpers/                    # Reusable test utilities
│   ├── mockExpress.js         # Mock Express request/response objects
│   └── mockPrisma.js          # Mock Prisma client for database operations
├── unit/                      # Unit tests organized by module
│   └── api/                   # API endpoint and middleware tests
│       ├── _lib/             # Library/utility function tests
│       │   ├── jwt.test.js
│       │   ├── authRequired.test.js
│       │   ├── response.test.js
│       │   └── requireRole.test.js
│       └── auth/             # Authentication endpoint tests
│           └── login.test.js
└── README.md                  # Detailed test documentation
```

## What's Tested

### ✅ JWT Utilities (`api/_lib/jwt.test.js`)
- Token signing (access and refresh tokens)
- Token verification
- Token expiration handling
- Invalid token detection
- Missing JWT_SECRET handling

### ✅ Authentication Middleware (`api/_lib/authRequired.test.js`)
- Valid token scenarios
- Invalid/missing token handling
- Token extraction from headers
- Error handling and edge cases
- Async handler support

### ✅ Response Utilities (`api/_lib/response.test.js`)
- Success responses (200, 201)
- Error responses (400, 401, 403, 404, 500)
- Date serialization
- Database error detection
- Development vs production error details

### ✅ Role-Based Access Control (`api/_lib/requireRole.test.js`)
- Single and multiple role requirements
- Access granted/denied scenarios
- Unauthenticated user handling
- Role validation

### ✅ Login Endpoint (`api/auth/login.test.js`)
- Request validation
- User authentication
- Password verification
- Token generation
- Cookie setting
- Development mode support
- Error handling

## Writing New Tests

### 1. Create Test File
Place test files next to the code they test, or in `tests/unit/` mirroring the source structure.

**Naming**: `*.test.js` or `*.spec.js`

### 2. Basic Test Structure

```javascript
import { describe, test, expect, beforeEach } from '@jest/globals';
import { functionToTest } from '../../../path/to/module.js';

describe('Module Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  describe('Feature Group', () => {
    test('should do something specific', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = functionToTest(input);
      
      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### 3. Using Test Helpers

#### Mock Express Request/Response
```javascript
import { createMockRequest, createMockResponse } from '../../helpers/mockExpress.js';

const req = createMockRequest({
  method: 'POST',
  body: { email: 'test@example.com' },
  headers: { authorization: 'Bearer token123' },
  user: { id: 'user1', role: 'admin' }
});

const res = createMockResponse();
```

#### Mock Prisma Client
```javascript
import { createMockPrisma } from '../../helpers/mockPrisma.js';

const mockPrisma = createMockPrisma();

// Seed test data
const user = mockPrisma.seed.user({
  email: 'test@example.com',
  passwordHash: await bcrypt.hash('password', 10),
  role: 'admin',
  status: 'active'
});

// Use in tests
const foundUser = await mockPrisma.user.findUnique({
  where: { email: 'test@example.com' }
});

// Reset between tests
mockPrisma.reset();
```

## Test Best Practices

1. **Isolation**: Each test should be independent
2. **Clear Names**: Test names should describe what is being tested
3. **AAA Pattern**: Arrange, Act, Assert
4. **Mock External Dependencies**: Database, APIs, file system, etc.
5. **Test Edge Cases**: Error conditions, boundary values, null/undefined
6. **Fast Tests**: Unit tests should run quickly (< 100ms each)
7. **No Side Effects**: Tests shouldn't modify global state

## Coverage Goals

- **Target**: >80% code coverage
- **Focus Areas**:
  - Authentication and authorization
  - Business logic
  - Error handling
  - Data validation

View coverage report:
```bash
npm run test:coverage
# Open coverage/lcov-report/index.html in browser
```

## Continuous Integration

Tests run automatically on:
- Pull requests
- Before deployment
- Pre-commit hooks (optional)

## Troubleshooting

### Tests fail with "Cannot find module"
- Ensure all dependencies are installed: `npm install`
- Check that Jest can resolve ES modules (see `jest.config.js`)

### "JWT_SECRET is not configured"
- Tests set this automatically in `tests/setup.js`
- If you see this error, check the setup file

### Mock not working
- Ensure mocks are set up in `beforeEach`
- Check that you're importing the mocked module correctly
- For ES modules, use `jest.unstable_mockModule()`

### Async test issues
- Always `await` async operations
- Use `async/await` in test functions
- Check that promises are properly resolved/rejected

## Next Steps

Consider adding tests for:
- More API endpoints (clients, projects, leads, etc.)
- Utility functions (databaseAPI, dataService, etc.)
- React components (with React Testing Library)
- Integration tests for full request/response cycles
- End-to-end tests for critical user flows

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- Project-specific: See `tests/README.md` for detailed documentation









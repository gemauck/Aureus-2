# Unit Tests

This directory contains unit tests for the Abcotronics ERP application.

## Test Structure

```
tests/
├── setup.js                 # Jest setup configuration
├── helpers/                 # Test helpers and mocks
│   ├── mockExpress.js      # Mock Express request/response
│   └── mockPrisma.js       # Mock Prisma client
└── unit/                   # Unit tests
    └── api/                # API endpoint tests
        ├── _lib/           # Library/utility tests
        └── auth/           # Authentication tests
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run only unit tests
```bash
npm run test:unit
```

## Test Coverage

The test suite covers:

- **JWT Utilities** (`api/_lib/jwt.test.js`)
  - Token signing (access and refresh tokens)
  - Token verification
  - Token expiration handling
  - Invalid token handling

- **Authentication Middleware** (`api/_lib/authRequired.test.js`)
  - Valid token scenarios
  - Invalid token scenarios
  - Error handling
  - Token extraction

- **Response Utilities** (`api/_lib/response.test.js`)
  - Success responses (ok, created)
  - Error responses (badRequest, unauthorized, forbidden, notFound, serverError)
  - Date serialization
  - Database error detection

- **Login Endpoint** (`api/auth/login.test.js`)
  - Request validation
  - User authentication
  - Successful login flow
  - Development mode handling
  - Error handling

## Writing New Tests

### Test File Naming
- Test files should be named `*.test.js` or `*.spec.js`
- Place tests in the same directory structure as the source code

### Example Test Structure

```javascript
import { describe, test, expect, beforeEach } from '@jest/globals';
import { functionToTest } from '../../../path/to/module.js';

describe('Module Name', () => {
  beforeEach(() => {
    // Setup code
  });

  describe('Feature Group', () => {
    test('should do something', () => {
      // Test code
      expect(result).toBe(expected);
    });
  });
});
```

### Using Mocks

#### Mock Express Request/Response
```javascript
import { createMockRequest, createMockResponse } from '../../helpers/mockExpress.js';

const req = createMockRequest({
  method: 'POST',
  body: { email: 'test@example.com' },
  headers: { authorization: 'Bearer token' }
});

const res = createMockResponse();
```

#### Mock Prisma
```javascript
import { createMockPrisma } from '../../helpers/mockPrisma.js';

const mockPrisma = createMockPrisma();
mockPrisma.seed.user({
  email: 'test@example.com',
  passwordHash: 'hashedpassword',
  status: 'active'
});
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Use `beforeEach` and `afterEach` to reset state
3. **Descriptive Names**: Test names should clearly describe what is being tested
4. **Arrange-Act-Assert**: Structure tests with clear sections
5. **Mock External Dependencies**: Mock database calls, external APIs, etc.
6. **Test Edge Cases**: Include tests for error conditions and boundary cases

## Continuous Integration

Tests should pass before:
- Merging pull requests
- Deploying to production
- Creating releases

## Coverage Goals

- Aim for >80% code coverage
- Focus on critical business logic
- Test error handling paths
- Test authentication and authorization

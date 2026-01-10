# CRM Unit Tests - Change Detection & Regression Prevention

## Why Unit Tests?

Unit tests are **essential** for maintaining a stable CRM system, especially when making changes. Here's why:

### ✅ Benefits

1. **Regression Prevention**: Catch bugs before they reach production
2. **Confidence in Changes**: Verify that modifications don't break existing functionality
3. **Documentation**: Tests serve as executable documentation of expected behavior
4. **Faster Development**: Catch issues early, reducing debugging time
5. **Refactoring Safety**: Safely refactor code knowing tests will catch breaking changes
6. **CI/CD Integration**: Automatically test on every commit/pull request

### 🎯 What These Tests Do

These unit tests specifically focus on **change detection** - ensuring that:
- API endpoints work correctly after code changes
- Data persistence logic remains intact
- JSON field writes are properly removed (normalized tables only)
- Business logic (duplicate detection, validation) works as expected
- Error handling works correctly
- Edge cases are handled gracefully

## Test Structure

```
tests/unit/
├── api/
│   ├── clients/
│   │   └── change-detection.test.js    # Client API tests
│   └── contacts/
│       └── change-detection.test.js    # Contacts API tests
├── api/_lib/
│   └── duplicateValidation.test.js     # Business logic tests
└── README.md                           # This file
```

## Running Tests

### Run All Unit Tests
```bash
npm run test:unit
```

### Run Specific Test File
```bash
npm test tests/unit/api/clients/change-detection.test.js
```

### Run Tests in Watch Mode (for development)
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

## Test Categories

### 1. Change Detection Tests

These tests ensure that changes to the codebase don't break existing functionality:

- **API Endpoint Tests**: Verify CRUD operations work correctly
- **Data Persistence Tests**: Ensure data is saved correctly
- **Field Preservation Tests**: Verify partial updates don't clear other fields
- **Type Safety Tests**: Ensure client/lead types are preserved correctly

### 2. Regression Prevention Tests

These tests prevent common regressions:

- **JSON Write Removal**: Ensures contacts/comments are NOT written to deprecated JSON fields
- **Normalized Table Usage**: Verifies all data goes to normalized tables (ClientContact, ClientComment)
- **Upsert vs CreateMany**: Ensures upsert is used (handles duplicate IDs correctly)

### 3. Business Logic Tests

These tests verify business rules work correctly:

- **Duplicate Detection**: Tests duplicate validation logic
- **Data Normalization**: Tests phone/email normalization
- **Validation**: Tests required field validation

### 4. Error Handling Tests

These tests verify error scenarios:

- **Database Errors**: Connection failures, query errors
- **Validation Errors**: Missing required fields
- **Not Found Errors**: Missing resources

## Key Test Patterns

### Mocking Prisma

All tests mock Prisma to test business logic in isolation:

```javascript
jest.unstable_mockModule('../../../../api/_lib/prisma.js', () => ({
  prisma: {
    client: {
      findMany: jest.fn(),
      create: jest.fn(),
      // ... other methods
    }
  }
}));
```

### Testing JSON Write Removal

Critical regression test - ensures JSON fields are never written:

```javascript
test('should NEVER write to contacts JSON field', async () => {
  // ... test setup
  
  // Verify update doesn't include contacts field
  const updateCall = mockPrisma.client.update.mock.calls[0][0];
  expect(updateCall.data.contacts).toBeUndefined();
  expect(updateCall.data.contactsJsonb).toBeUndefined();
});
```

### Testing Upsert Usage

Ensures upsert is used instead of createMany (handles duplicate IDs):

```javascript
test('should use upsert for contacts when provided', async () => {
  // ... test setup
  
  // Should use upsert, not createMany
  expect(mockPrisma.clientContact.upsert).toHaveBeenCalled();
});
```

## Best Practices

1. **Run tests before committing**: `npm run test:unit`
2. **Add tests for new features**: When adding new functionality, add corresponding tests
3. **Update tests when behavior changes**: If you intentionally change behavior, update tests
4. **Keep tests focused**: Each test should test one thing
5. **Use descriptive test names**: Test names should clearly describe what they test

## When to Write New Tests

Write new unit tests when:

- ✅ Adding a new API endpoint
- ✅ Modifying business logic
- ✅ Changing data persistence logic
- ✅ Fixing a bug (add a test to prevent regression)
- ✅ Refactoring code (ensure existing tests still pass)

## Integration vs Unit Tests

- **Unit Tests** (this directory): Test individual functions/modules in isolation with mocked dependencies
- **Integration Tests** (`tests/crm/`): Test full workflows with real database connections

Both are valuable:
- Unit tests: Fast, isolated, easy to debug
- Integration tests: Verify end-to-end workflows work correctly

## Troubleshooting

### Tests failing after changes

1. **Check if behavior intentionally changed**: Update tests if behavior change is intentional
2. **Check mock setup**: Ensure Prisma mocks are correctly configured
3. **Check async/await**: Ensure all async operations are properly awaited
4. **Check test isolation**: Ensure tests don't depend on execution order

### Mock not working

1. **Check import paths**: Ensure mock paths match actual import paths
2. **Check jest.unstable_mockModule**: Use `unstable_mockModule` for ES modules
3. **Check mock timing**: Mocks must be set up before imports

## Continuous Improvement

As the codebase evolves:

1. Add tests for new features
2. Refactor tests to match code structure changes
3. Update test patterns as best practices evolve
4. Review and remove obsolete tests
5. Improve test coverage over time

## Related Documentation

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Integration Tests](../crm/README.md) (if it exists)
- [API Documentation](../../../api/README.md) (if it exists)


# Unit Tests for CRM - Complete Guide

## Is This a Good Idea? ✅ **YES!**

Unit tests are **absolutely essential** for a production CRM system. Here's why:

### 🎯 Benefits for Your CRM

1. **Prevents Breaking Changes**: When you modify code, tests immediately tell you if something broke
2. **Confidence in Deployments**: Deploy knowing your changes work correctly
3. **Faster Development**: Catch bugs early, reduce debugging time
4. **Documentation**: Tests show how the system is supposed to work
5. **Refactoring Safety**: Safely improve code structure without fear
6. **Team Collaboration**: New team members understand expected behavior through tests

### 🚨 Real-World Scenario

**Without Tests:**
- Make a change to client API
- Deploy to production
- Users report data loss or errors
- Emergency hotfix needed
- Stressful production debugging

**With Tests:**
- Make a change to client API
- Run tests: `npm run test:unit`
- Tests fail showing the issue
- Fix before deploying
- Deploy with confidence

## What We've Created

### Test Files

1. **`tests/unit/api/clients/change-detection.test.js`**
   - Tests client CRUD operations
   - Verifies normalized table usage
   - Ensures JSON writes are removed
   - Tests error handling

2. **`tests/unit/api/contacts/change-detection.test.js`**
   - Tests contact CRUD operations
   - Ensures contacts only go to normalized tables
   - Prevents JSON field writes

3. **`tests/unit/api/_lib/duplicateValidation.test.js`**
   - Tests duplicate detection logic
   - Verifies data normalization (phones, emails)
   - Tests edge cases

### Supporting Files

- **`tests/unit/README.md`**: Detailed documentation
- **`tests/unit/run-change-detection-tests.js`**: Quick test runner script

## How to Use

### Quick Start

```bash
# Run all unit tests
npm run test:unit

# Run change detection tests only
node tests/unit/run-change-detection-tests.js

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run with coverage report
npm run test:coverage
```

### Before Making Changes

1. **Make your code changes**
2. **Run tests**: `npm run test:unit`
3. **If tests pass**: ✅ Safe to commit
4. **If tests fail**: 
   - Review failures
   - Fix code or update tests (if behavior intentionally changed)
   - Re-run tests
   - Commit when all pass

### Example Workflow

```bash
# 1. Start working on a feature
git checkout -b feature/new-client-feature

# 2. Make code changes
# ... edit files ...

# 3. Run tests
npm run test:unit

# 4. If tests pass, commit
git add .
git commit -m "Add new client feature"

# 5. If tests fail, fix issues first
# ... fix code ...
npm run test:unit
# ... repeat until tests pass ...
```

## Test Categories

### 1. Change Detection Tests

These ensure changes don't break existing functionality:

```javascript
test('should NOT write to deprecated JSON fields when querying', async () => {
  // Verifies that JSON writes are removed
  expect(mockPrisma.client.update).not.toHaveBeenCalled();
});
```

### 2. Regression Prevention Tests

These prevent common bugs from returning:

```javascript
test('should NEVER write to contacts JSON field', async () => {
  // Critical: Ensures normalized tables are used
  expect(updateCall.data.contacts).toBeUndefined();
});
```

### 3. Business Logic Tests

These verify business rules work correctly:

```javascript
test('should detect duplicate by name (case-insensitive)', async () => {
  // Tests duplicate detection
  expect(result.isDuplicate).toBe(true);
});
```

## Key Testing Patterns

### Mocking Prisma

All tests mock Prisma to test logic in isolation:

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

### Testing API Handlers

Tests verify API handlers work correctly with mocked dependencies:

```javascript
test('should create client and sync contacts to normalized table', async () => {
  mockPrisma.client.create.mockResolvedValue(createdClient);
  await handler(req, res);
  
  expect(mockPrisma.client.create).toHaveBeenCalled();
  expect(res.statusCode).toBe(201);
});
```

### Testing Business Logic

Tests verify business rules independently:

```javascript
test('should normalize phone numbers', async () => {
  // Test that '(011) 123-4567' matches '0111234567'
  const result = await checkForDuplicates({
    contacts: [{ phone: '(011) 123-4567' }]
  });
  expect(result.isDuplicate).toBe(true);
});
```

## What Gets Tested

### ✅ Currently Tested

- Client API endpoints (GET, POST, PUT, DELETE)
- Contact API endpoints
- Duplicate validation logic
- Data normalization (phones, emails)
- JSON write removal (regression prevention)
- Normalized table usage
- Error handling
- Partial update preservation

### 🔄 Could Be Added (Future)

- Lead API endpoints (similar to clients)
- Comment API endpoints
- Search functionality
- Permission checks
- Data transformation logic
- Cache invalidation
- Rate limiting

## Best Practices

### 1. Run Tests Frequently

```bash
# After making changes
npm run test:unit

# Before committing
npm run test:unit
```

### 2. Write Tests for New Features

When adding new functionality:
1. Write the test first (TDD approach) OR
2. Write tests alongside the feature
3. Ensure tests pass before merging

### 3. Keep Tests Focused

Each test should:
- Test one thing
- Have a descriptive name
- Be independent (not rely on other tests)
- Clean up after itself (if needed)

### 4. Update Tests When Behavior Changes

If you intentionally change behavior:
- Update corresponding tests
- Document why behavior changed
- Ensure all tests still pass

## Common Issues & Solutions

### Issue: Tests fail after code changes

**Solution**: 
- If behavior intentionally changed: Update tests
- If behavior unintentionally changed: Fix code
- If mock setup wrong: Fix mocks

### Issue: Mock not working

**Solution**:
- Check import paths match
- Use `jest.unstable_mockModule` for ES modules
- Ensure mocks are set up before imports

### Issue: Tests are slow

**Solution**:
- Use mocks instead of real database
- Run specific test files during development
- Use watch mode for faster feedback

## Integration with CI/CD

### Recommended Setup

Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run Unit Tests
  run: npm run test:unit

- name: Run Tests with Coverage
  run: npm run test:coverage
```

This ensures:
- All pull requests are tested
- Tests pass before merging
- Coverage reports are generated

## Metrics & Goals

### Coverage Goals

- **Current**: Starting coverage (new tests)
- **Short-term Goal**: 60% coverage of API endpoints
- **Long-term Goal**: 80%+ coverage of critical paths

### Test Goals

- **All API endpoints**: Should have tests
- **All business logic**: Should be tested
- **All error cases**: Should be tested
- **Critical regressions**: Should have dedicated tests

## Comparison: Unit vs Integration Tests

| Aspect | Unit Tests | Integration Tests |
|--------|------------|-------------------|
| **Speed** | Fast (ms) | Slower (seconds) |
| **Dependencies** | Mocked | Real database |
| **Scope** | Individual functions | Full workflows |
| **Use Case** | Test logic in isolation | Test end-to-end flows |
| **Location** | `tests/unit/` | `tests/crm/` |

**Both are valuable!**
- Unit tests: Fast feedback, isolate issues
- Integration tests: Verify real workflows work

## Next Steps

1. **Run the tests**: `npm run test:unit`
2. **Review test output**: Ensure all pass
3. **Add tests for new features**: As you build
4. **Run before commits**: Make it a habit
5. **Improve coverage**: Gradually add more tests

## Resources

- [Unit Tests README](tests/unit/README.md) - Detailed documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Existing Integration Tests](tests/crm/) - See how integration tests work

## Conclusion

**Unit tests are a best practice** for any production system. They:
- ✅ Save time (catch bugs early)
- ✅ Increase confidence (know changes work)
- ✅ Improve code quality (forces better design)
- ✅ Enable faster development (safer refactoring)
- ✅ Document behavior (executable specs)

Start using them today! 🚀


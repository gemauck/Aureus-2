# CRM Test Suite

Comprehensive test suite for CRM/Lead functionality covering break tests, persistence tests, functionality tests, UI tests, and business logic tests.

## Test Suites

### 1. Break Tests (`crm-break-tests.js`)
Tests error handling, edge cases, and failure modes:
- Missing authentication
- Invalid input validation
- SQL injection attempts
- XSS attempts
- Rate limiting
- Concurrent operations
- Database connection failures
- Invalid data formats

**Run:** `npm run test:crm:break`

### 2. Persistence Tests (`crm-persistence-tests.js`)
Tests data persistence across operations:
- Create/Read/Update/Delete operations
- Status and stage persistence
- JSON field persistence (contacts, followUps, billingTerms)
- Partial updates
- Rapid updates
- Database direct verification

**Run:** `npm run test:crm:persistence`

### 3. Functionality Tests (`crm-functionality-tests.js`)
Tests all CRM features and workflows:
- List all leads
- Get single lead
- Create with all fields
- Update operations
- Delete operations
- Duplicate detection
- External agent assignment
- Contacts management
- FollowUps management
- Billing terms
- Search and filtering
- Lead ordering

**Run:** `npm run test:crm:functionality`

### 4. Business Logic Tests (`crm-business-logic-tests.js`)
Tests validation, normalization, and business rules:
- Status normalization
- Stage default values
- Type field enforcement
- Status hardcoding bug detection
- Number parsing and defaults
- Date parsing and defaults
- JSON field serialization
- Industry defaults
- Name trimming
- Notes concatenation
- Owner assignment
- Zero defaults

**Run:** `npm run test:crm:business`

### 5. UI Tests (`crm-ui-tests.js`)
Browser-based component testing (run in browser console):
- Component existence checks
- API wrapper availability
- Form validation
- Auto-save functionality
- Tab navigation
- Responsive design
- Accessibility (ARIA labels)
- Keyboard navigation
- Performance checks

**Run:** Load in browser console and execute `window.runCRMUITests()`

## Running Tests

### Run All CRM Tests
```bash
npm run test:crm
```

### Run Individual Test Suites
```bash
# Break tests
npm run test:crm:break

# Persistence tests
npm run test:crm:persistence

# Functionality tests
npm run test:crm:functionality

# Business logic tests
npm run test:crm:business
```

### Run UI Tests
1. Start the application: `npm run dev`
2. Open browser and navigate to Clients/Leads section
3. Open browser DevTools Console
4. Load the UI test script or paste the code from `crm-ui-tests.js`
5. Run: `window.runCRMUITests()`

## Configuration

Tests use environment variables:
- `APP_URL` or `TEST_URL` - API base URL (default: `http://localhost:3000`)
- `DATABASE_URL` - Database connection string (for direct DB tests)

## Test Results

Each test suite outputs:
- ✅ Passed tests
- ❌ Failed tests
- ⚠️  Warnings
- 📊 Summary with success rate
- ⏱️  Duration

## Known Issues Detected

The test suite will detect and report:

1. **Status Field Hardcoding Bug**
   - Status is hardcoded to 'active' in API
   - Location: `api/leads.js` lines 534, 682
   - Impact: Users cannot set lead status to 'Potential' or 'Disinterested'

2. **Missing Test Coverage**
   - Some edge cases may not be fully covered
   - UI tests require manual browser execution

## Test Data Cleanup

All test suites automatically clean up created test data after execution. Test leads are tracked and deleted in the cleanup phase.

## Continuous Integration

To integrate into CI/CD:

```yaml
# Example GitHub Actions
- name: Run CRM Tests
  run: npm run test:crm
```

## Troubleshooting

### Tests Fail with Authentication Errors
- Ensure you have a valid JWT token
- Check `APP_URL` is correct
- Verify server is running

### Database Connection Errors
- Check `DATABASE_URL` is set correctly
- Ensure database is accessible
- Verify Prisma client is initialized

### UI Tests Not Working
- Ensure you're on the correct page (Clients/Leads)
- Check browser console for errors
- Verify all required scripts are loaded

## Test Coverage Goals

- **Break Tests**: 80% coverage of error paths
- **Persistence Tests**: 100% coverage of CRUD operations
- **Functionality Tests**: 90% coverage of all features
- **UI Tests**: 70% coverage of user interactions
- **Business Logic Tests**: 100% coverage of validation/normalization

## Contributing

When adding new CRM features:
1. Add corresponding break tests for error cases
2. Add persistence tests for data operations
3. Add functionality tests for new features
4. Add business logic tests for validation rules
5. Update UI tests if UI components change

## Files

- `crm-break-tests.js` - Error handling and edge cases
- `crm-persistence-tests.js` - Data persistence verification
- `crm-functionality-tests.js` - Feature completeness
- `crm-business-logic-tests.js` - Business rules validation
- `crm-ui-tests.js` - Browser-based UI testing
- `run-all-crm-tests.js` - Test suite runner
- `README.md` - This file


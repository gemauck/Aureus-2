# Document Collection Module Tests

## Automated (node)

Run the comprehensive module checks (templates + activity + notifications):

```bash
TEST_URL=https://abcoafrica.co.za \
TEST_EMAIL=you@example.com \
TEST_PASSWORD=yourpassword \
TEST_EMAIL_RECIPIENT=you@example.com \
node tests/document-collection-module-tests.js
```

## Browser-side checks

1. Log in and open a project with the Document Collection tracker visible.
2. Open the browser console.
3. Paste the script from `tests/document-collection-browser.js`.
4. Review results in the console.

Optional: set `RUN_SEND_EMAIL = true` in the script to send a test request.

## Inbound processing (unit test)

Run the inbound reply parser tests:

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/api/inbound/document-request-reply.test.js
```

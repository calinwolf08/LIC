# Commands to Run

This file contains commands that need to be run manually when convenient.

## Completed

✅ **Test Coverage Package** (already installed)
```bash
npm install --save-dev @vitest/coverage-v8@3.2.3
```

## Future Commands

When you're ready to test the workflows locally:

### Run Tests with Coverage
```bash
npm run test:unit -- --run --coverage
```

### View Coverage Report
```bash
# After running tests with coverage
open coverage/index.html
# or on Linux:
xdg-open coverage/index.html
```

### Install Playwright for E2E Tests
```bash
npx playwright install --with-deps
npm run test:e2e
```

### Verify CI Pipeline Locally
```bash
# Run all checks that CI will run
npm run lint
npm run check
npm run test:unit -- --run
npm run build
```

## Notes

- The GitHub Actions workflows will run automatically on push/PR
- Coverage reports are generated as artifacts and retained for 7 days
- All tests can be run locally before pushing

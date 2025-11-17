# GitHub Actions Workflows

This directory contains CI/CD workflows for the project.

## Workflows

### CI (`ci.yml`)

Runs on every push and pull request to main/master branches.

**Jobs:**

1. **Lint & Type Check**
   - Runs Prettier formatting checks
   - Runs TypeScript and Svelte type checking

2. **Unit Tests**
   - Runs Vitest unit tests
   - Tests both client and server code

3. **E2E Tests**
   - Installs Playwright browsers
   - Runs end-to-end tests
   - Uploads test reports on failure

4. **Build**
   - Builds the production version
   - Ensures the app compiles successfully

### Test Coverage (`test-coverage.yml`)

Generates and uploads test coverage reports.

**Jobs:**

1. **Coverage Report**
   - Runs unit tests with coverage enabled
   - Uploads coverage to Codecov (optional)
   - Saves coverage reports as artifacts

## Setup

### Required Dependencies

The workflows use these npm scripts:
- `npm run lint` - Prettier check
- `npm run check` - TypeScript/Svelte check
- `npm run test:unit -- --run` - Unit tests
- `npm run test:e2e` - E2E tests
- `npm run build` - Production build

### Optional: Codecov Integration

To enable Codecov coverage reporting:

1. Sign up at [codecov.io](https://codecov.io)
2. Add your repository
3. Add `CODECOV_TOKEN` to GitHub repository secrets
4. Coverage will automatically upload on each run

If you don't want Codecov, the workflow will still generate coverage reports as artifacts.

## Local Testing

Run these commands locally to match CI:

```bash
# Install dependencies
npm ci

# Lint and type check
npm run lint
npm run check

# Run unit tests
npm run test:unit -- --run

# Run unit tests with coverage
npm run test:unit -- --run --coverage

# Run E2E tests (requires Playwright installation)
npx playwright install --with-deps
npm run test:e2e

# Build
npm run build
```

## Coverage Reports

Coverage reports are:
- Displayed in the console (text format)
- Saved as HTML in `coverage/` directory
- Uploaded to Codecov (if configured)
- Available as GitHub Actions artifacts

To view coverage locally:
```bash
npm run test:unit -- --run --coverage
open coverage/index.html
```

## Artifacts

### Test Artifacts

Workflows upload artifacts that are retained for 7 days:

- **playwright-report** - E2E test results and traces (only on failure)
- **coverage-report** - Code coverage HTML reports

Access artifacts from the GitHub Actions run page.

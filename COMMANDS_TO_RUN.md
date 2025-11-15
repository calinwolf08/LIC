# Commands to Run

This file contains commands that need to be run manually when convenient.

## Completed

✅ **Test Coverage Package** (already installed)
```bash
npm install --save-dev @vitest/coverage-v8@3.2.3
```

## Required for Steps 1-2: Database Setup

### Step 01: Kysely Database Setup

Install Kysely and related packages:

```bash
# Kysely - Type-safe SQL query builder
npm install kysely

# Kysely codegen - Generate TypeScript types from database
npm install --save-dev kysely-codegen

# SQLite driver (already installed as better-sqlite3)
# No additional installation needed
```

### Step 02: Database Schema & Migrations

After creating the migration files, run:

```bash
# Run migrations to create tables
npm run db:migrate

# Generate TypeScript types from database schema
npm run db:types
```

These scripts will be added to package.json:
```json
{
  "scripts": {
    "db:migrate": "tsx src/lib/db/migrations/run.ts",
    "db:types": "kysely-codegen --dialect=sqlite --out-file=src/lib/db/types.ts"
  }
}
```

You'll also need tsx to run TypeScript files directly:
```bash
npm install --save-dev tsx
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
- Database migrations should be run whenever schema changes
- Type generation should be run after migrations to keep types in sync

# LIC Scheduling App

Automated schedule generation for Longitudinal Integrated Clerkship (LIC) programs in medical schools.

## Overview

The LIC Scheduling App helps medical school administrators automatically create schedules for students in LIC programs. Instead of spending hours manually assigning students to preceptors and tracking requirements, the app handles scheduling automatically using a constraint-based algorithm.

**Current Status:** 🚧 In Development (9.7% complete - 3/31 steps)

See [`docs/mvp-implementation-plan/STATUS.md`](docs/mvp-implementation-plan/STATUS.md) for detailed progress.

## Features

### ✅ Completed
- **Authentication System** - Email/password login and registration
- **Constraint-Based Scheduling Algorithm** - Extensible scheduling engine with violation tracking
- **CI/CD Infrastructure** - Automated testing and coverage reporting

### 🚧 In Progress
- Foundation setup (database, utilities)
- Student/Preceptor/Clerkship management
- Calendar view and schedule editing
- Excel export

See [MVP Requirements](MVP_REQUIREMENTS.md) for complete feature list.

## Tech Stack

- **Framework:** SvelteKit 2.22 with Svelte 5.0
- **Database:** SQLite with Kysely (type-safe SQL)
- **Authentication:** better-auth
- **Styling:** Tailwind CSS 4.0
- **UI Components:** shadcn-svelte
- **Forms:** sveltekit-superforms + formsnap
- **Validation:** Zod
- **Testing:** Vitest + Playwright
- **CI/CD:** GitHub Actions

## Quick Start

### Prerequisites
- Node.js 20+
- npm or pnpm

### Installation

```bash
# Clone repository
git clone <repo-url>
cd LIC

# Install dependencies
npm install

# Start development server
npm run dev
```

### Development Commands

```bash
# Development
npm run dev              # Start dev server
npm run dev -- --open    # Start dev server and open browser

# Type Checking & Linting
npm run check            # TypeScript/Svelte type check
npm run lint             # Prettier format check
npm run format           # Auto-format with Prettier

# Testing
npm run test:unit        # Run unit tests (watch mode)
npm run test:unit -- --run         # Run unit tests once
npm run test:unit -- --run --coverage  # Run with coverage
npm run test:e2e         # Run E2E tests
npm run test             # Run all tests

# Building
npm run build            # Production build
npm run preview          # Preview production build
```

## Project Structure

```
/src/
├── lib/
│   ├── features/               # Feature vertical architecture
│   │   ├── auth/              # ✅ Authentication (login, register)
│   │   ├── scheduling/        # ✅ Scheduling algorithm
│   │   └── shared/            # Shared components
│   ├── components/ui/         # shadcn-svelte components
│   ├── db/                    # Database setup (TODO)
│   ├── api/                   # API utilities (TODO)
│   └── validation/            # Validation utilities (TODO)
│
├── routes/
│   ├── api/                   # API endpoints
│   │   └── schedules/generate/ # ✅ Schedule generation endpoint
│   ├── login/                 # ✅ Login page
│   ├── register/              # ✅ Register page
│   └── +page.svelte           # ✅ Homepage
│
/docs/
├── mvp-implementation-plan/   # Detailed implementation steps
│   ├── STATUS.md             # Current progress
│   ├── 00-COMPLETED-authentication.md
│   ├── 17-COMPLETED-scheduling-algorithm.md
│   ├── 29-COMPLETED-cicd-workflows.md
│   └── 01-28.md              # Remaining steps
│
└── MVP_REQUIREMENTS.md        # Complete requirements

/.github/
└── workflows/                 # ✅ CI/CD workflows
    ├── ci.yml                # Main CI pipeline
    ├── test-coverage.yml     # Coverage reporting
    └── README.md             # Workflow documentation
```

## Architecture

### Feature Vertical Design

Each feature is self-contained with:
```
/lib/features/{feature}/
├── components/        # UI components
├── services/         # Business logic & DB operations
├── utils/           # Helper functions
└── schemas.ts       # Zod validation schemas
```

### Scheduling Algorithm

Constraint-based scheduling engine with:
- **5 Built-in Constraints:** No double-booking, preceptor capacity, availability, blackout dates, specialty matching
- **Violation Tracking:** Identifies why scheduling fails
- **Extensible:** Easy to add custom constraints
- **Type-Safe:** Full TypeScript support

See [`docs/mvp-implementation-plan/17-COMPLETED-scheduling-algorithm.md`](docs/mvp-implementation-plan/17-COMPLETED-scheduling-algorithm.md)

## Testing

### Test Infrastructure
- ✅ Vitest for unit tests (client & server)
- ✅ Playwright for E2E tests
- ✅ Coverage reporting with v8
- ✅ GitHub Actions CI/CD

### Running Tests Locally

```bash
# Unit tests
npm run test:unit -- --run --coverage
open coverage/index.html

# E2E tests (requires Playwright)
npx playwright install --with-deps
npm run test:e2e

# All CI checks
npm run lint && npm run check && npm run test:unit -- --run && npm run build
```

### CI/CD

All tests run automatically on push/PR:
- ✅ Lint & type checking
- ✅ Unit tests
- ✅ E2E tests
- ✅ Production build
- ✅ Coverage reporting

## Implementation Plan

Detailed step-by-step implementation guide in [`docs/mvp-implementation-plan/`](docs/mvp-implementation-plan/).

**31 Total Steps:**
- ✅ 3 Completed (Auth, Scheduling, CI/CD)
- ⏳ 28 Pending

**Next Steps:**
1. Step 01: Kysely Database Setup
2. Step 02: Database Schema & Migrations
3. Step 03: Shared Utilities & Test Helpers

Each step includes:
- Requirements & dependencies
- File structure
- Business logic specifications
- Comprehensive test requirements
- Acceptance criteria
- Usage examples

## Contributing

### Development Workflow

1. Pick a step from the implementation plan
2. Follow the step documentation
3. Write tests first (TDD)
4. Implement functionality
5. Ensure all tests pass
6. Push to feature branch
7. CI will run automatically

### Code Quality

- TypeScript strict mode
- Prettier for formatting
- ESLint for linting
- 100% test coverage goal for business logic

## License

[Add license information]

## Contact

[Add contact information]

---

**Status:** 🚧 Active Development | **Progress:** 9.7% | **Last Updated:** 2025-11-15

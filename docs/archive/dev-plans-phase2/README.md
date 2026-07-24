# Phase 2 Development Plans

This folder contains detailed development plans for the next phase of LIC features.

## Recommended Order of Completion

The plans should be completed in this order based on dependencies and complexity:

| Order | Plan | Description | Dependencies |
|-------|------|-------------|--------------|
| 1 | [PLAN_05_STUDENT_PAGE_UPDATES](./PLAN_05_STUDENT_PAGE_UPDATES.md) | Add completion % to list, remove onboarding tab, add Details tab | None - isolated UI changes |
| 2 | [PLAN_06_HEALTH_SYSTEMS_REDESIGN](./PLAN_06_HEALTH_SYSTEMS_REDESIGN.md) | Convert to table, create detail page with tabs | None - isolated UI changes |
| 3 | [PLAN_01_BLACKOUT_DATES_UI](./PLAN_01_BLACKOUT_DATES_UI.md) | Add blackout dates management to calendar page | None - uses existing service layer |
| 4 | [PLAN_02_FALLBACK_ONLY_PRECEPTORS](./PLAN_02_FALLBACK_ONLY_PRECEPTORS.md) | Add fallback-only flag to preceptors/teams | None - scheduling engine update |
| 5 | [PLAN_04_ELECTIVES_UI_SCHEDULING](./PLAN_04_ELECTIVES_UI_SCHEDULING.md) | Build electives UI, update scheduling engine | None - but benefits from #4 being done |
| 6 | [PLAN_03_MULTI_SCHEDULE_SUPPORT](./PLAN_03_MULTI_SCHEDULE_SUPPORT.md) | Full multi-schedule with data scoping | Largest change - do last |

## Rationale

### Start with UI-only changes (Plans 5 & 6)
- **Student Page Updates** and **Health Systems Redesign** are purely UI changes
- No database migrations, no scheduling engine changes
- Quick wins that improve user experience immediately
- Low risk, easy to test and verify

### Then backend/scheduling changes (Plans 1, 2, 4)
- **Blackout Dates UI** uses existing service layer, just needs API and UI
- **Fallback-Only Preceptors** modifies scheduling behavior but is self-contained
- **Electives** builds on existing schema, adds scheduling logic

### Multi-Schedule last (Plan 3)
- Largest and most complex change
- Touches almost every part of the application
- Creates junction tables that affect all entity queries
- Should be done when other features are stable

## Estimation Notes

Each plan is broken into phases that can be completed incrementally:
- Phase completion = working feature increment
- Each phase includes testing requirements
- All phases require `npm run check` and `npm run test` before completion

## Quick Reference

| Plan | New Tables | Schema Changes | API Routes | UI Components |
|------|------------|----------------|------------|---------------|
| 01 - Blackout Dates | 0 | 0 | 3 | 2 |
| 02 - Fallback Preceptors | 0 | 2 columns | 2 | 2 |
| 03 - Multi-Schedule | 7 | 1 column | 6 | 4 |
| 04 - Electives | 2 | 1 column | 6 | 3 |
| 05 - Student Page | 0 | 0 | 1 | 2 |
| 06 - Health Systems | 0 | 0 | 1 | 3 |

# Bug: auto-generation can violate the L3 block-week constraint

**Status:** open — surfaced 2026-10-01 while routing the L3 constraint through the
real generate UI button.

## Symptom

When a schedule mixes a **block** (inpatient) clerkship and a **scattered**
(outpatient) clerkship, auto-generation can place a scattered day inside the week
a block consumes — the exact thing L3 is meant to prevent. Reproduced through both
the HTTP generate endpoint (`autogen-constraints` "L3" e2e) and the real
"Apply Regeneration" dialog button (`generate-ui` L3 e2e). Both are marked
`test.fixme` and are the regression guards for this bug.

It is data/date-sensitive: it needs the scattered preceptor's only non-block-week
availability to be a date that `strategy-context` drops from `availableDates`
(see below). The engine unit test `02-scheduling-engine` **Test 10** uses simpler
data (one shared site, same week alignment) and still passes, which is why this
went unnoticed.

## Root cause (traced)

For the scattered clerkship's placement:

1. `ConfigurableSchedulingEngine.applySessionAwareAvailability` **correctly** marks
   the block's week forbidden and filters the scattered preceptor's `availability`
   down to the free-week day (e.g. `['2026-10-19']`).
2. But `StrategyContext.buildAvailableDates` produces a `context.availableDates`
   that is **missing that same free-week day**. The scheduling strategies place
   days from `preceptor.availability ∩ availableDates`, so the intersection is
   empty and the scattered requirement cannot be placed in the main loop.
3. The requirement is then handed to the **fallback gap-filler**
   (`enableFallbacks: true`), which places the day without applying the L3
   block-week filter — landing it inside the block week.

So there are two defects to fix together:

- **`availableDates` vs. `preceptor.availability` disagree** about the valid
  free-week day. `buildAvailableDates` excludes a date that per-preceptor filtering
  keeps. The two must agree, or the strategy will keep missing legitimately-open
  days.
- **The fallback gap-filler does not honor L3** (and should honor the same gated
  constraints the main loop does). Even once the first defect is fixed, the
  fallback must not be able to reintroduce a block-week violation.

## Suggested next steps

1. Instrument `buildAvailableDates` to confirm why the free-week day is excluded
   (blackout read is global/un-scoped; verify it is not an existing-assignment or
   date-range off-by-one).
2. Make the fallback gap-filler run proposals through the same block-week / session
   / mutual-exclusion filtering as the main loop.
3. Un-`fixme` the two L3 e2e tests above and the engine unit coverage.

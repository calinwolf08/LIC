# Dev Plan: Smart Regeneration Options

**Feature**: Add smart regeneration UI with preserve-past and preview options
**Priority**: High
**Effort**: Medium (4-5 hours)
**Value**: Very High - Prevents destructive regeneration

## Overview

Enhance the regeneration dialog to expose existing API capabilities for preserving past assignments and previewing changes before committing.

## Current State

**UI** (`regenerate-dialog.svelte`):
- Only offers date range selection
- Always deletes ALL assignments
- No options for preservation or strategy

**API** (`/api/schedules/generate`):
- ✅ Supports `regenerateFromDate` parameter
- ✅ Supports `strategy` (minimal-change vs full-reoptimize)
- ✅ Supports `preview` mode
- ❌ None of these are exposed in UI

## Goal

Transform regeneration dialog from destructive-only to intelligent with options:

```
┌─────────────────────────────────────────────────┐
│ Regenerate Schedule                              │
├─────────────────────────────────────────────────┤
│ Regeneration Mode:                               │
│ ○ Full Regeneration (Start Over)                │
│   Delete all assignments and create new         │
│                                                  │
│ ● Smart Regeneration (Preserve Past)            │
│   Keep assignments before: [Mar 1, 2025]        │
│   Only regenerate: Mar 1 - Dec 31, 2025         │
│                                                  │
│ Strategy:                                        │
│ ● Minimal Change - Keep as much as possible     │
│ ○ Full Reoptimize - Find best solution          │
│                                                  │
│ [Preview Changes] [Apply Regeneration]           │
└─────────────────────────────────────────────────┘
```

## Implementation

### 1. Update Component State

**File**: `src/lib/features/schedules/components/regenerate-dialog.svelte`

Add new state variables:

```typescript
let regenerationMode = $state<'full' | 'smart'>('smart');  // Default to smart
let regenerateFromDate = $state<string>('');  // Cutoff date
let strategy = $state<'minimal-change' | 'full-reoptimize'>('minimal-change');
let showPreview = $state(false);
let previewData = $state<RegenerationPreview | null>(null);
```

### 2. Initialize Smart Defaults

Update the `$effect` that runs when dialog opens:

```typescript
$effect(() => {
  if (open) {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
    const lastDayOfYear = new Date(today.getFullYear(), 11, 31);

    startDate = formatDateForInput(firstDayOfYear);
    endDate = formatDateForInput(lastDayOfYear);

    // NEW: Default regenerateFromDate to today
    regenerateFromDate = formatDateForInput(today);

    // NEW: Default to smart mode if mid-year
    const dayOfYear = Math.floor((today - firstDayOfYear) / (1000 * 60 * 60 * 24));
    regenerationMode = dayOfYear > 30 ? 'smart' : 'full';  // Smart if past Jan

    strategy = 'minimal-change';
    showPreview = false;
    previewData = null;
    errors = [];
    successMessage = '';
  }
});
```

### 3. Add Preview Functionality

Create preview function:

```typescript
async function handlePreview() {
  isRegenerating = true;
  errors = [];

  try {
    const requestBody: any = {
      startDate,
      endDate,
      preview: true  // KEY: Preview mode
    };

    if (regenerationMode === 'smart') {
      requestBody.regenerateFromDate = regenerateFromDate;
      requestBody.strategy = strategy;
    }

    const response = await fetch('/api/schedules/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const result = await response.json();
      errors = [result.error?.message || 'Preview failed'];
      return;
    }

    const result = await response.json();
    previewData = result.data.impactAnalysis;  // Preview data
    showPreview = true;

  } catch (error) {
    errors = ['Failed to generate preview'];
  } finally {
    isRegenerating = false;
  }
}
```

### 4. Update Regenerate Function

Modify `handleRegenerate` to use selected mode:

```typescript
async function handleRegenerate() {
  isRegenerating = true;
  errors = [];
  successMessage = '';

  try {
    // Only delete if full regeneration mode
    if (regenerationMode === 'full') {
      const deleteResponse = await fetch('/api/schedules', {
        method: 'DELETE'
      });

      if (!deleteResponse.ok) {
        const result = await deleteResponse.json();
        errors = [result.error?.message || 'Failed to clear schedules'];
        return;
      }
    }

    // Generate with appropriate parameters
    const requestBody: any = {
      startDate,
      endDate
    };

    if (regenerationMode === 'smart') {
      requestBody.regenerateFromDate = regenerateFromDate;
      requestBody.strategy = strategy;
    }

    const generateResponse = await fetch('/api/schedules/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!generateResponse.ok) {
      const result = await generateResponse.json();
      errors = [result.error?.message || 'Failed to generate schedule'];
      return;
    }

    const generateResult = await generateResponse.json();
    const data = generateResult.data;

    // Show appropriate success message
    if (regenerationMode === 'smart') {
      successMessage = `Preserved ${data.totalPastAssignments} past assignments. ` +
        `Generated ${data.summary.totalAssignments} new assignments from ${regenerateFromDate}.`;
    } else {
      successMessage = `Successfully generated ${data.summary.totalAssignments} new assignments.`;
    }

    setTimeout(() => {
      onConfirm?.();
    }, 2000);

  } catch (error) {
    errors = ['An unexpected error occurred'];
  } finally {
    isRegenerating = false;
  }
}
```

### 5. Update Dialog UI

Add mode selector, strategy options, and preview section:

```svelte
<!-- Warning - only show for full mode -->
{#if regenerationMode === 'full'}
  <div class="mb-4 rounded-md bg-amber-50 border border-amber-200 p-4">
    <p class="font-semibold text-amber-800">⚠️ Warning</p>
    <p class="text-sm text-amber-700 mt-1">
      This will <strong>delete all existing assignments</strong> and generate
      a new schedule from scratch. This action cannot be undone.
    </p>
  </div>
{/if}

<!-- Mode Selection -->
<div class="space-y-3 mb-4">
  <Label class="text-base font-semibold">Regeneration Mode</Label>

  <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
    <input
      type="radio"
      value="full"
      bind:group={regenerationMode}
      disabled={isRegenerating}
      class="mt-1"
    />
    <div class="flex-1">
      <p class="font-medium">Full Regeneration (Start Over)</p>
      <p class="text-sm text-muted-foreground">
        Delete all assignments and generate completely new schedule
      </p>
      <p class="text-xs text-muted-foreground mt-1">
        Use when: Major requirement changes or complete restructure needed
      </p>
    </div>
  </label>

  <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
    <input
      type="radio"
      value="smart"
      bind:group={regenerationMode}
      disabled={isRegenerating}
      class="mt-1"
    />
    <div class="flex-1">
      <p class="font-medium">Smart Regeneration (Preserve Past)</p>
      <p class="text-sm text-muted-foreground">
        Keep assignments before cutoff date, only regenerate future
      </p>
      <p class="text-xs text-muted-foreground mt-1">
        Use when: Mid-year adjustments or fixing specific issues
      </p>
    </div>
  </label>
</div>

<!-- Smart Mode Options -->
{#if regenerationMode === 'smart'}
  <div class="space-y-4 mb-4 p-4 bg-muted/30 rounded-lg">
    <!-- Cutoff Date -->
    <div class="space-y-2">
      <Label for="cutoff_date">Regenerate From Date</Label>
      <input
        id="cutoff_date"
        type="date"
        bind:value={regenerateFromDate}
        disabled={isRegenerating}
        min={startDate}
        max={endDate}
        class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <p class="text-xs text-muted-foreground">
        Assignments before this date will be preserved
      </p>
    </div>

    <!-- Strategy Selection -->
    <div class="space-y-2">
      <Label class="text-sm font-semibold">Strategy</Label>

      <label class="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          value="minimal-change"
          bind:group={strategy}
          disabled={isRegenerating}
          class="mt-1"
        />
        <div>
          <p class="text-sm font-medium">Minimal Change</p>
          <p class="text-xs text-muted-foreground">
            Try to keep as many future assignments as possible
          </p>
        </div>
      </label>

      <label class="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          value="full-reoptimize"
          bind:group={strategy}
          disabled={isRegenerating}
          class="mt-1"
        />
        <div>
          <p class="text-sm font-medium">Full Reoptimize</p>
          <p class="text-xs text-muted-foreground">
            Find completely new optimal solution for future dates
          </p>
        </div>
      </label>
    </div>
  </div>
{/if}

<!-- Date Range (always show) -->
<div class="space-y-4 mb-4">
  <div class="space-y-2">
    <Label for="start_date">Schedule Start Date</Label>
    <input
      id="start_date"
      type="date"
      bind:value={startDate}
      disabled={isRegenerating}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    />
  </div>

  <div class="space-y-2">
    <Label for="end_date">Schedule End Date</Label>
    <input
      id="end_date"
      type="date"
      bind:value={endDate}
      disabled={isRegenerating}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    />
  </div>
</div>

<!-- Preview Section -->
{#if showPreview && previewData}
  <div class="mb-4 rounded-md bg-blue-50 border border-blue-200 p-4">
    <p class="font-semibold text-blue-800 mb-2">📊 Preview Impact</p>
    <div class="text-sm text-blue-900 space-y-1">
      {#if regenerationMode === 'smart'}
        <p>✓ Would preserve: <strong>{previewData.preservedCount}</strong> assignments</p>
        <p>↻ Would regenerate: <strong>{previewData.regenerateCount}</strong> assignments</p>
        <p>📅 Regeneration range: {regenerateFromDate} to {endDate}</p>
      {:else}
        <p>🔄 Would create: <strong>{previewData.totalNew}</strong> assignments</p>
        <p>📅 Schedule range: {startDate} to {endDate}</p>
      {/if}
      {#if previewData.estimatedGapReduction}
        <p class="text-green-700">
          📈 Expected improvement: Close {previewData.estimatedGapReduction} day gap
        </p>
      {/if}
    </div>
  </div>
{/if}

<!-- Actions -->
<div class="flex justify-end gap-2">
  <Button variant="outline" onclick={onCancel} disabled={isRegenerating}>
    Cancel
  </Button>

  {#if !showPreview}
    <Button variant="secondary" onclick={handlePreview} disabled={isRegenerating}>
      Preview Changes
    </Button>
  {/if}

  <Button
    variant={regenerationMode === 'full' ? 'destructive' : 'default'}
    onclick={handleRegenerate}
    disabled={isRegenerating}
  >
    {isRegenerating ? 'Regenerating...' : 'Apply Regeneration'}
  </Button>
</div>
```

### 6. Add Type Definitions

**File**: `src/lib/features/schedules/types/regeneration.ts` (new)

```typescript
export type RegenerationMode = 'full' | 'smart';
export type RegenerationStrategy = 'minimal-change' | 'full-reoptimize';

export interface RegenerationPreview {
  preservedCount: number;
  regenerateCount: number;
  totalNew: number;
  estimatedGapReduction?: number;
  affectedStudents: string[];
  affectedPreceptors: string[];
}

export interface RegenerationOptions {
  mode: RegenerationMode;
  startDate: string;
  endDate: string;
  regenerateFromDate?: string;
  strategy?: RegenerationStrategy;
  preview?: boolean;
}
```

### 7. API Enhancements (if needed)

**File**: `src/routes/api/schedules/generate/+server.ts`

Ensure preview mode returns proper data structure:

```typescript
if (validatedData.preview) {
  // Return impact analysis without making changes
  const impactAnalysis = await analyzeRegenerationImpact(
    db,
    validatedData.regenerateFromDate,
    validatedData.strategy
  );

  return successResponse({
    preview: true,
    impactAnalysis: {
      preservedCount: impactAnalysis.preservedAssignments,
      regenerateCount: impactAnalysis.affectedAssignments,
      totalNew: impactAnalysis.newAssignments,
      estimatedGapReduction: impactAnalysis.expectedImprovement
    }
  });
}
```

## Testing

### Manual Testing

1. **Full Regeneration**:
   - Select "Full Regeneration"
   - Verify warning shows
   - Click preview - should show total new assignments
   - Apply - should delete all and generate new

2. **Smart Regeneration (Today)**:
   - Select "Smart Regeneration"
   - Set cutoff to today
   - Verify warning doesn't show
   - Preview should show preserved vs regenerate counts
   - Apply should keep past, regenerate future

3. **Strategy Comparison**:
   - Preview with "Minimal Change"
   - Note numbers
   - Preview with "Full Reoptimize"
   - Numbers should differ

4. **Edge Cases**:
   - Cutoff date = start date (should be full regeneration)
   - Cutoff date = end date (should preserve everything)
   - Invalid dates

### Test Cases

```typescript
describe('RegenerateDialog', () => {
  it('defaults to smart mode mid-year', () => {
    // Mock date to June
    // Open dialog
    // Expect smart mode selected
  });

  it('sends correct API parameters for full mode', () => {
    // Select full mode
    // Click apply
    // Expect DELETE + POST with no regenerateFromDate
  });

  it('sends correct API parameters for smart mode', () => {
    // Select smart mode
    // Set cutoff date
    // Click apply
    // Expect POST with regenerateFromDate and strategy
  });

  it('shows preview data correctly', () => {
    // Click preview
    // Mock API response
    // Expect preview section to show
  });
});
```

## Files to Modify

1. **Main component**: `src/lib/features/schedules/components/regenerate-dialog.svelte`
2. **Types (new)**: `src/lib/features/schedules/types/regeneration.ts`
3. **API endpoint**: `src/routes/api/schedules/generate/+server.ts` (verify preview mode)

## Success Criteria

- ✅ Users can choose between full and smart regeneration
- ✅ Smart mode defaults to today as cutoff date
- ✅ Preview shows accurate impact before applying
- ✅ Full mode shows warning, smart mode doesn't
- ✅ Strategy selection affects result
- ✅ Past assignments are preserved in smart mode
- ✅ UI is clear and guides user to correct choice

## Timeline

- **Component state**: 30 min
- **UI updates**: 1.5 hours
- **Preview logic**: 1 hour
- **API integration**: 1 hour
- **Testing**: 1 hour

**Total**: ~5 hours

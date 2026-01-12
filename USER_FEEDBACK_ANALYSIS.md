# User Feedback Analysis

Parsed and clarified from user testing session.

---

## 🐛 BUGS

| ID | Bug | Details | Location |
|----|-----|---------|----------|
| B1 | **Health System delete not working** | Clicking delete button has no effect. Possibly due to dependencies (preceptors/sites linked to the health system), but no error message or explanation shown to user. | Health Systems page |
| B2 | **"Loading teams" shown indefinitely** | Shows "loading teams" even when there are no teams. Appears to be stuck loading forever rather than showing empty state. | Teams management |
| B3 | **Calendar date filter defaults to single month** | Filter defaults to a single month instead of the full schedule window. Should default to show the entire schedule date range. | Schedules calendar view |

---

## ✨ FEATURE REQUESTS

### Availability & Time Management

| ID | Feature | Details | Priority |
|----|---------|---------|----------|
| F1 | **AM/PM time slots for availability** | Allow preceptors to mark availability for mornings or afternoons only, not just full days. Enables half-day scheduling. | High |
| F2 | **Half-day student assignments** | Support assigning students to one preceptor in AM and another in PM, based on preceptor half-day availability. | High |
| F3 | **Notes on availability** | Free-text notes field for availability (e.g., "starts at 9am", "no Wednesdays after 2pm", "prefers mornings"). | Medium |
| F4 | **Availability indicator on preceptor table** | Visual indicator showing whether a preceptor has availability configured. Makes it clear when user still needs to set up availability. | Medium |
| F5 | **Preceptor availability calendar view** | Calendar visualization showing when each preceptor is available (highlight available days). Useful for tracking even without auto-generation. | Medium |

### Scheduling & Assignments

| ID | Feature | Details | Priority |
|----|---------|---------|----------|
| F6 | **Preset/locked student assignments** | Allow users to pre-create assignments (student A with preceptor B at site C for clerkship D during week E) before running generation. Algorithm should work around these locked assignments. Should validate the assignment is valid, or allow user to override validation. | High |
| F7 | **Block-based scheduling for clerkships** | Some clerkships require consecutive day blocks (e.g., 6 weeks in Surgery). Clerkship config should specify required block size. Algorithm should: (1) assign complete blocks to students, (2) not assign partial blocks that don't satisfy requirements, (3) notify user if partial block is only option. Example: 14-week preceptor availability → assign 6-week block to student 1, 6-week block to student 2, leave 2-week remainder unassigned unless no other option. | High |
| F8 | **Scheduling readiness indicator** | Clear UI indication of whether each entity (preceptor, clerkship, etc.) is ready for schedule generation. Show what's missing (no availability, no team assigned, etc.). Prevent confusion when generation returns 0 results. | High |

### Navigation & Workflow

| ID | Feature | Details | Priority |
|----|---------|---------|----------|
| F9 | **Edit site inline from preceptor form** | When creating/editing a preceptor, allow quick-editing the linked site without losing preceptor form data. User encountered site with wrong health system and had to abandon preceptor creation to fix it. | Medium |
| F10 | **Streamlined clerkship → team → clerkship flow** | When on clerkship config, clicking "manage teams" should allow adding a team and returning to clerkship config seamlessly. Current flow requires manual navigation back. | Medium |
| F11 | **Preceptor creation wizard with availability** | Consider making preceptor creation a full page (not modal) with availability setup as part of the wizard. Ensures availability is configured during creation, not forgotten. | Medium |

---

## 🎨 UX/UI IMPROVEMENTS

### Authentication & Onboarding

| ID | Issue | Details | Suggested Fix |
|----|-------|---------|---------------|
| U1 | **Password placeholder confusion** | User thought placeholder text in password field was actual text and tried to edit it instead of typing their password. | Use clearer placeholder or password dots, consider "Enter password" as placeholder with proper styling |

### Terminology & Clarity

| ID | Issue | Details | Suggested Fix |
|----|-------|---------|---------------|
| U2 | **"Scheduling strategy" options unclear** | Clerkship config has scheduling strategy dropdown but options' meanings and impact on schedule aren't explained. | Add tooltips or help text explaining each strategy option and when to use it |
| U3 | **"Fallback" terminology confusing** | User didn't understand this refers to backup preceptor when primary can't cover entire requirement. | Rename to "Backup Preceptor" or add explanation: "Used when primary preceptor is unavailable" |
| U4 | **Team concept not explained** | Users don't understand: (1) why teams exist, (2) that even single preceptors need a team, (3) that no team = preceptor excluded from scheduling. This is a critical gap. | Add prominent explanation. Consider: "Teams group preceptors for scheduling. Every preceptor must belong to at least one team to be included in schedule generation." |
| U5 | **"Associated sites" label confusing** | Label is unclear in context. | Rename to something more descriptive like "Sites where this preceptor works" or "Assigned sites" |
| U6 | **"Schedule" vs "Calendar" route confusion** | User went to /schedules expecting to generate a schedule. Didn't realize /schedules is for creating schedule periods and /calendar shows results. | Rename routes or add clearer labels. "Schedule Periods" vs "Schedule Calendar"? Or consolidate into single scheduling hub. |
| U7 | **Availability is required but not obvious** | User didn't know availability must be set for preceptors to be included in generation. Not clear during creation or on preceptor list. | Add required indicator, include in creation flow, show warning on preceptor table for those without availability |

### Forms & Input

| ID | Issue | Details | Suggested Fix |
|----|-------|---------|---------------|
| U8 | **Redundant site creation buttons** | Site list page has two buttons that both create a site but with different text. Confusing. | Use single button, or ensure both have identical text |
| U9 | **No unsaved changes warning** | User closed preceptor creation modal, went to edit a site, then had to re-enter all preceptor information. Lost work. | Add "You have unsaved changes" warning on close. Or auto-save draft. Or allow inline site editing without leaving form. |
| U10 | **Site hierarchy expectation mismatch** | User expected to create a main site with sub-sites underneath. Current design: each location is a separate site entity. | Add explanatory text: "Each clinical location should be its own site. Sites are grouped by Health System." |
| U11 | **Dropdown vs text input confusion** | User tried typing site name in preceptor form instead of using dropdown. Didn't realize no sites existed yet. | Add "No sites found - create one first" message in empty dropdown. Or allow inline site creation. |

### Navigation & Workflow

| ID | Issue | Details | Suggested Fix |
|----|-------|---------|---------------|
| U12 | **Expected setup order not clear** | User went to preceptors first (not the expected order based on sidebar). No guidance on recommended setup sequence. | Add onboarding flow or setup checklist: "1. Create Health Systems → 2. Create Sites → 3. Add Preceptors → 4. Create Teams → 5. Configure Clerkships" |
| U13 | **Manage Teams navigation is dead-end** | Clicking "Manage Teams" from clerkship goes to teams page but no easy way back to clerkship config. Hard to complete the workflow. | Add breadcrumb, "back to clerkship" link, or handle team selection inline |
| U14 | **Availability not shown on preceptor popup** | When viewing preceptor details, availability isn't immediately visible. User had to hunt for it. | Show availability summary in preceptor detail view/popup |

### Calendar & Filtering

| ID | Issue | Details | Suggested Fix |
|----|-------|---------|---------------|
| U15 | **Calendar filter not obviously a filter** | User wasn't clear the controls were filters at all. | Add "Filter" label, use collapsible filter panel, or add filter icon |
| U16 | **Calendar filter misleads about generation scope** | User filtered to single clerkship and expected only that clerkship to be generated. Filter only affects view, not generation. | Add clear label: "Display Filter (does not affect schedule generation)" or separate generation options from view filters |

---

## 📋 SUMMARY

### By Category

| Category | Count |
|----------|-------|
| Bugs | 3 |
| Feature Requests | 11 |
| UX/UI Improvements | 16 |
| **Total** | **30** |

### Critical Issues (Address First)

These cause the most user confusion and friction:

1. **U4: Team concept not explained** - Users don't understand teams are required, leading to empty schedules
2. **F8: Scheduling readiness indicator** - Users try to generate without proper setup, get 0 results, don't know why
3. **U7: Availability requirement not obvious** - Same issue, preceptors without availability silently excluded
4. **B1: Health System delete not working** - Broken functionality with no feedback
5. **U9: No unsaved changes warning** - Users losing work

### High-Value Features

1. **F6: Preset/locked assignments** - Core workflow need for real-world scheduling
2. **F7: Block-based scheduling** - Required for clerkships with consecutive-day requirements
3. **F1/F2: Half-day scheduling** - Common real-world need

### Quick Wins

1. **U8: Redundant buttons** - Simple text/UI fix
2. **B2: Loading teams state** - Show empty state instead
3. **B3: Calendar date defaults** - Default to full schedule range
4. **U3: Rename "Fallback"** - Simple terminology fix

---

## 🗂️ ITEMS DEFERRED

| Original Note | Reason |
|---------------|--------|
| "Start trial button" | User clarified this was initial confusion, not an issue to address |
| "Using optional fields" | User clarified no issue - they just didn't understand optional fields were optional |
| "Preceptor shows up for health system in edit page but not main table" | Unable to reproduce, unclear steps. Monitor for recurrence. |

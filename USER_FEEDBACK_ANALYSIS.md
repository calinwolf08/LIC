# User Feedback Analysis

Parsed from user testing session notes.

---

## 🐛 BUGS

### High Priority

| # | Bug | Original Note | Location |
|---|-----|---------------|----------|
| B1 | **Health System delete not working** | "Health System delete not working" | Health Systems page |
| B2 | **Preceptor visibility inconsistency** - Shows in health system edit page but not in main table | "Preceptor shows up for health system in edit page but not main table" | Health Systems / Preceptors tables |
| B3 | **Calendar filter not populating schedule dates** | "Calendar page doesn't populate with schedule dates for filter" | Schedules calendar view |

### Medium Priority

| # | Bug | Original Note | Location |
|---|-----|---------------|----------|
| B4 | **Teams loading state stuck or unclear** | "Says loading teams" | Teams management |
| B5 | **Schedule calendar filter misleading** - Filter doesn't actually limit schedule generation | "Schedule Calendar filter misleading. Not actually limiting schedule generation" | Schedule generation |

---

## ✨ FEATURE REQUESTS

### Availability & Time Management

| # | Feature | Original Note | Priority |
|---|---------|---------------|----------|
| F1 | **AM/PM time option for availability** - Add time-of-day granularity | "No am/pm option for availability" | High |
| F2 | **Half-day assignments** - Support splitting days for students | "Students may split days that split as half days" | High |
| F3 | **Notes on availability** - Allow text notes (e.g., "starts at 9 AM") | "Add notes on availability. Ex starts at 9 am." | Medium |
| F4 | **Availability indicator on preceptor table** - Show at-a-glance if preceptor has availability configured | "Should make clear on preceptor table if they have availability" | Medium |
| F5 | **Preceptor availability calendar view** - Visual calendar showing preceptor availability | "Helpful to have preceptor availability calendar" | Medium |

### Scheduling & Assignments

| # | Feature | Original Note | Priority |
|---|---------|---------------|----------|
| F6 | **Preset/custom student assignments** - Pre-assign students before schedule generation | "Need to add custom assignments for students that are preset" | High |
| F7 | **Block-based scheduling** - Ensure students are assigned to complete blocks satisfying requirements | "Scheduling blocks, make sure students will be assigned to a full block that satisfies requirements" | High |
| F8 | **Clerkship block specification** - Allow clerkships to define their scheduling blocks | "Clerkships should be able to specify block" | Medium |

### Navigation & Workflow

| # | Feature | Original Note | Priority |
|---|---------|---------------|----------|
| F9 | **Edit site from preceptor modal** - Quick-edit linked site without leaving preceptor form | "Wants to edit site from preceptor window cus site system mismatch and wanted to edit" | Medium |
| F10 | **Better navigation from clerkship to teams** - Easier back-and-forth between clerkship config and team management | "On clerkship, hard to go to manage Team then back to clerkship configuration" | Medium |
| F11 | **Show availability in preceptor popup** - Display availability immediately when viewing preceptor | "Went to preceptor, didn't see availability immediately on pop up" | Low |

### Hierarchy & Organization

| # | Feature | Original Note | Priority |
|---|---------|---------------|----------|
| F12 | **Sub-sites support** - Allow sites to have child/sub-sites | "Tried creating site with a bunch of sub sites" | Low |

---

## 🎨 UX/UI IMPROVEMENTS

### Terminology & Clarity

| # | Issue | Original Note | Suggested Fix |
|---|-------|---------------|---------------|
| U1 | **"Scheduling strategy" unclear** | "Scheduling strategy has no meaning" | Add tooltip/help text explaining assignment strategies |
| U2 | **"Fallback" terminology confusing** | "What does fallback mean?" | Add explanation: "Backup preceptor when primary is unavailable" |
| U3 | **Team concept not explained** | "Manage teams goes to preceptor page but doesn't explain teams concept" | Add intro text or onboarding for teams feature |
| U4 | **Teams needed for clerkship unclear** | "Teams needed for clerkship not clear" | Better documentation on when/why to use teams |
| U5 | **"Schedule" vs "Generate" confusion** | "Schedule terminology not clear, tried to create new schedule in order to generate" | Clarify that "Schedule" is a time period, "Generate" creates assignments |
| U6 | **Readiness to schedule unclear** | "Not clear that not ready to schedule" | Add checklist/status indicator showing what's needed before generation |
| U7 | **How to enter availability unclear** | "Not clear how to enter preceptor availability" | Add prominent "Add Availability" button or guided flow |

### Forms & Input

| # | Issue | Original Note | Suggested Fix |
|---|-------|---------------|---------------|
| U8 | **Password placeholder text issue** | "Placeholder text for password" | Review password field placeholder (may be missing or unclear) |
| U9 | **Redundant site creation buttons** | "New site and create site buttons redundant" | Consolidate to single "Create Site" button |
| U10 | **Lost work on close** | "Closed new preceptor without saving and has to make new one with new site etc." | Add unsaved changes warning or auto-save draft |

### Workflow Expectations

| # | Issue | Original Note | Suggested Fix |
|---|-------|---------------|---------------|
| U11 | **Expected workflow: Preceptor → Site** | "Went to preceptor first, expected type to enter site" | Allow inline site creation from preceptor form |
| U12 | **Expected setup order** | "Preceptor then student then clerkship" | Consider guided onboarding showing recommended setup order |
| U13 | **Calendar filter view unclear** | "Calendar filter view not clear" | Improve filter UI with clearer labels and behavior |

---

## 📋 SUMMARY

### By Category Count

| Category | Count |
|----------|-------|
| Bugs | 5 |
| Feature Requests | 12 |
| UX/UI Improvements | 13 |
| **Total** | **30** |

### Recommended Priority Order

**Phase 1 - Critical Fixes:**
1. B1: Health System delete not working
2. B2: Preceptor visibility inconsistency
3. B3: Calendar filter not populating dates
4. U6: Readiness indicator for scheduling

**Phase 2 - Core Feature Gaps:**
1. F1: AM/PM time options for availability
2. F2: Half-day assignments
3. F6: Preset/custom student assignments
4. F7: Block-based scheduling

**Phase 3 - Terminology & Onboarding:**
1. U1-U5: Add tooltips/help text for confusing terminology
2. U12: Guided setup flow showing recommended order
3. U7: Clear availability entry guidance

**Phase 4 - Quality of Life:**
1. F3-F5: Availability notes, indicators, and calendar view
2. F9-F11: Navigation improvements
3. U9-U10: Form improvements (redundant buttons, unsaved changes warning)

---

## 🔍 NOTES FOR FOLLOW-UP

Some items need clarification:
- "Start trial button" - Context unclear. Related to subscription/pricing?
- "Using optional fields" - What was the issue exactly?
- "Associated sites" - Was this confusing or missing functionality?

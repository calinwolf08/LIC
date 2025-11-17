# LIC Scheduling App - MVP Features & Requirements

## What This App Does

The LIC Scheduling App helps medical school administrators automatically create schedules for students in Longitudinal Integrated Clerkship (LIC) programs. Instead of spending hours manually assigning students to preceptors and tracking requirements, the app does the heavy lifting automatically.

## Who Uses This App

**Primary Users**: Medical school administrators who manage LIC programs
- Create and manage student schedules
- Track student progress toward graduation requirements
- Coordinate with preceptors (clinical supervisors)
- Generate reports for school administration

## Key Problems This Solves

### Before This App:
- ❌ Administrators spend days manually creating schedules in spreadsheets
- ❌ Hard to ensure all students meet their clerkship requirements
- ❌ Difficult to handle preceptor schedule changes or vacation requests
- ❌ No easy way to see conflicts or missing requirements
- ❌ Time-consuming to regenerate schedules when things change

### After This App:
- ✅ Automatic schedule generation in minutes, not days
- ✅ Guaranteed requirement tracking for each student
- ✅ Easy schedule adjustments when preceptors change availability
- ✅ Clear visual calendar showing all assignments
- ✅ Export schedules to share with students and preceptors

## MVP Feature Set

### 1. Secure Administrator Access
**What it does**: Only authorized staff can access the scheduling system.

**Features**:
- Email and password login for administrators
- Secure session management
- Automatic logout for security

**Why it matters**: Protects sensitive student and preceptor information.

### 2. Student Information Management
**What it does**: Store and manage all student information needed for scheduling.

**Features**:
- Add new students with name and contact information
- Edit student details when needed
- View complete list of all students
- Remove students who withdraw from the program

**Business Rules**:
- Each student must have a unique email address
- Students cannot be deleted if they have existing schedule assignments
- All student names and emails are required

### 3. Preceptor Management & Availability
**What it does**: Manage clinical supervisors and track when they're available to teach.

**Features**:
- Add preceptors with contact information and medical specialties
- Set which days each preceptor is available to supervise students
- Edit availability when preceptors go on vacation or change schedules
- Track maximum number of students each preceptor can supervise (currently set to 1)

**Business Rules**:
- Preceptors can only teach in their designated medical specialties
- Preceptors cannot be assigned students on days they're marked unavailable
- Each preceptor can supervise a maximum of one student at a time
- Weekends are included in available scheduling days

### 4. Clerkship Requirements Setup
**What it does**: Define how many days each student must complete in different medical specialties.

**Features**:
- Create different types of clerkships (Internal Medicine, Surgery, Pediatrics, etc.)
- Set required number of days for each clerkship type
- Edit requirements when curriculum changes
- Connect clerkships to preceptors who can teach them

**Business Rules**:
- Requirements are measured in full days (not hours or half-days)
- Each student must complete all defined clerkship requirements
- Only preceptors with matching specialties can teach specific clerkships

### 5. Automatic Schedule Generation
**What it does**: Creates optimized schedules for all students automatically.

**Features**:
- Set academic year start and end dates
- Generate complete schedules for all students with one click
- Automatically assigns students to preceptors based on requirements and availability
- Ensures no scheduling conflicts (student can't be in two places at once)
- Prioritizes completing student requirements first

**How it works**:
- The system uses a "greedy" algorithm that makes the best available choice at each step
- It considers student requirements, preceptor availability, and blackout dates
- Focuses on getting students the clerkship days they need most urgently

**Business Rules**:
- Students cannot be double-booked (assigned to multiple preceptors on same day)
- Preceptors cannot supervise more than their maximum capacity
- No assignments on system-wide blackout dates (holidays, exam periods)
- Algorithm prioritizes completing student requirements over perfect distribution

### 6. Blackout Date Management
**What it does**: Define days when no clinical activities should be scheduled.

**Features**:
- Add dates when the medical school is closed (holidays, exam weeks)
- Remove blackout dates if plans change
- View all blackout dates in the academic year

**Business Rules**:
- No student-preceptor assignments can be made on blackout dates
- Blackout dates apply system-wide to all students and preceptors

### 7. Schedule Viewing & Calendar Display
**What it does**: Provides clear visual representation of all schedules.

**Features**:
- Calendar view showing all student assignments
- Color-coding by clerkship type or student
- Daily, weekly, and monthly calendar views
- Quick overview of who is assigned where and when
- Easy identification of scheduling gaps or conflicts

**Business Rules**:
- Calendar displays only confirmed assignments
- Visual indicators for different clerkship types
- Clear identification of unscheduled time periods

### 8. Schedule Adjustment & Regeneration
**What it does**: Allows administrators to modify schedules and create new ones when needed.

**Features**:
- Edit individual student assignments
- Move students between preceptors
- Regenerate entire schedule when major changes occur
- All changes require administrator approval before being finalized

**When to regenerate**:
- Preceptor goes on unexpected vacation
- New student joins the program mid-year
- Clerkship requirements change
- Major schedule conflicts discovered

**Business Rules**:
- Manual edits override automatic assignments
- Regeneration preserves manually-approved assignments when possible
- All schedule changes must maintain requirement completion goals

### 9. Excel Export & Reporting
**What it does**: Creates spreadsheet reports for sharing and record-keeping.

**Features**:
- Export master schedule showing all assignments
- Includes student names, preceptor names, dates, and clerkship types
- Professional formatting suitable for sharing with faculty
- Downloadable Excel file format

**Report Contents**:
- Complete schedule overview for the academic year
- Student assignment details
- Preceptor assignment details
- Clerkship completion tracking

## What's NOT Included in MVP

### Features for Future Versions:
- **Student/Preceptor Logins**: Only administrators can access the system initially
- **Email Notifications**: No automatic emails when schedules change
- **Mobile App**: Web-based interface only
- **Advanced Reporting**: Basic Excel export only
- **Schedule Optimization**: Uses simple greedy algorithm, not complex optimization
- **Integration**: No connection to other school systems
- **Individual Schedules**: No separate student or preceptor portals

### Business Rules Not Addressed:
- **Complex Prerequisites**: No "must complete A before B" requirements
- **Student Preferences**: Students cannot request specific preceptors or dates
- **Preceptor Preferences**: Preceptors cannot request specific students
- **Location Management**: No tracking of multiple clinical sites
- **Partial Days**: All assignments are full days only

## Success Criteria

### The MVP is successful if:
- ✅ Administrators can create a complete academic year schedule in under 30 minutes
- ✅ All students are assigned the correct number of days for each required clerkship
- ✅ No scheduling conflicts exist (double-bookings, unavailable preceptors)
- ✅ Schedule changes can be made and regenerated quickly
- ✅ Final schedules can be exported and shared with stakeholders
- ✅ System reduces manual scheduling time by at least 80%

### Performance Requirements:
- **Scheduling Speed**: Generate schedules for 6 students within 10 seconds
- **Data Entry**: Support up to 10 preceptors and 10 clerkship types
- **Reliability**: System available during business hours with minimal downtime
- **Accuracy**: 100% accuracy in requirement tracking and conflict detection

## User Journey Example

### Typical Administrator Workflow:

1. **Setup Phase** (Done once per academic year):
   - Login to the system
   - Add all students for the year
   - Add preceptors and set their availability
   - Define clerkship requirements
   - Set blackout dates (holidays, exam periods)

2. **Schedule Generation**:
   - Set academic year start and end dates
   - Click "Generate Schedule" button
   - Review the automatically created schedule
   - Make any necessary manual adjustments
   - Approve and finalize the schedule

3. **Ongoing Management**:
   - Monitor schedule throughout the year
   - Handle preceptor availability changes
   - Adjust assignments as needed
   - Regenerate schedules when major changes occur
   - Export final schedules for distribution

4. **Reporting**:
   - Export Excel files for sharing
   - Review student requirement completion
   - Generate reports for school administration

## Technical Requirements Summary

### Data Storage Needs:
- Student information (names, contact details)
- Preceptor information (names, specialties, availability)
- Clerkship definitions and requirements
- Schedule assignments (student-preceptor-date combinations)
- Blackout dates
- System configuration settings

### Key Calculations:
- **Requirement Tracking**: How many days each student still needs in each clerkship
- **Availability Matching**: Which preceptors are available for which students on which dates
- **Conflict Detection**: Ensuring no double-bookings or impossible assignments
- **Schedule Optimization**: Finding the best assignment for each student each day

This MVP focuses on core scheduling functionality while keeping the system simple enough to build and deploy quickly. Future versions can add more sophisticated features based on user feedback and needs.

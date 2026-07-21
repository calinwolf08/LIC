# Step 17: Schedule Algorithm Specification

## Overview
This document specifies the greedy scheduling algorithm for assigning students to preceptors for their required clerkship rotations. **This step is DOCUMENTATION ONLY**. The user will implement the actual algorithm later. This document provides detailed pseudocode, business rules, constraints, and test cases.

## Dependencies
- ✅ Step 04: Students - Service Layer
- ✅ Step 07: Preceptors - Service Layer
- ✅ Step 08: Preceptor Availability - Service Layer
- ✅ Step 11: Clerkships - Service Layer
- ✅ Step 14: Blackout Dates - Service Layer

## Requirements

### Algorithm Objective
Assign each student to preceptors for all required clerkship rotations, respecting all business constraints and optimizing for successful placement.

### Input Requirements
- Start date (YYYY-MM-DD)
- End date (YYYY-MM-DD)
- List of all students
- List of all clerkships
- List of all preceptors with their specialties and availability
- List of all blackout dates

### Output Requirements
- List of schedule assignments (student, preceptor, clerkship, start_date, end_date)
- Each assignment respects all constraints
- Maximum possible students have all required rotations assigned

### Business Constraints

#### Hard Constraints (Must Not Be Violated)
1. **Specialty Matching**: Preceptor specialty must match clerkship specialty
2. **Availability**: Preceptor must be available for entire assignment period
3. **Capacity**: Preceptor can only supervise max_students at a time (MVP: always 1)
4. **Blackout Dates**: No assignments can overlap with blackout dates
5. **No Conflicts**: Each student can only have one assignment at a time
6. **Duration**: Each assignment must be at least clerkship.required_days long
7. **Date Boundaries**: Assignments must fall within start_date and end_date

#### Soft Constraints (Optimize When Possible)
1. **Fair Distribution**: Distribute students evenly across preceptors when possible
2. **Minimize Gaps**: Minimize gaps between a student's assignments
3. **Completion**: Prioritize completing all rotations for a student before moving to next

---

## Algorithm Specification

### High-Level Approach

**Greedy Algorithm with Backtracking:**
1. For each student (in order)
2. For each required clerkship (in order)
3. Find available preceptor that matches specialty
4. Assign student to preceptor for required duration
5. If no valid assignment possible, mark as unassigned
6. Continue to next clerkship/student

### Detailed Pseudocode

```pseudocode
FUNCTION generateSchedule(startDate, endDate, students, clerkships, preceptors, blackoutDates):
  assignments = []
  clerkshipTypes = getAllClerkships()

  FOR EACH student IN students:
    studentAssignments = []
    currentDate = startDate

    FOR EACH clerkship IN clerkshipTypes:
      // Find next available slot for this clerkship
      assignment = findNextAvailableAssignment(
        student,
        clerkship,
        currentDate,
        endDate,
        preceptors,
        blackoutDates,
        assignments
      )

      IF assignment IS NOT NULL:
        assignments.push(assignment)
        studentAssignments.push(assignment)
        currentDate = assignment.end_date + 1 day
      ELSE:
        // Unable to assign this clerkship
        LOG warning: "Could not assign ${student.name} to ${clerkship.name}"
      END IF
    END FOR
  END FOR

  RETURN assignments
END FUNCTION


FUNCTION findNextAvailableAssignment(
  student,
  clerkship,
  earliestStartDate,
  latestEndDate,
  preceptors,
  blackoutDates,
  existingAssignments
):
  // Get preceptors matching specialty
  matchingPreceptors = preceptors.filter(p => p.specialty == clerkship.specialty)

  // Try each matching preceptor
  FOR EACH preceptor IN matchingPreceptors:
    // Get preceptor's availability periods
    availabilityPeriods = getAvailability(preceptor.id)

    FOR EACH availPeriod IN availabilityPeriods:
      // Skip if availability is before earliest start date
      IF availPeriod.end_date < earliestStartDate:
        CONTINUE
      END IF

      // Skip if availability is after latest end date
      IF availPeriod.start_date > latestEndDate:
        CONTINUE
      END IF

      // Determine potential start date
      potentialStartDate = max(earliestStartDate, availPeriod.start_date)
      potentialEndDate = potentialStartDate + clerkship.required_days - 1

      // Check if assignment fits in availability period
      IF potentialEndDate > availPeriod.end_date:
        CONTINUE
      END IF

      // Check if assignment fits within scheduling window
      IF potentialEndDate > latestEndDate:
        CONTINUE
      END IF

      // Check for blackout date conflicts
      IF hasBlackoutConflict(potentialStartDate, potentialEndDate, blackoutDates):
        CONTINUE
      END IF

      // Check for preceptor conflicts (another student assigned)
      IF hasPreceptorConflict(
        preceptor.id,
        potentialStartDate,
        potentialEndDate,
        existingAssignments
      ):
        CONTINUE
      END IF

      // Check for student conflicts (student already assigned elsewhere)
      IF hasStudentConflict(
        student.id,
        potentialStartDate,
        potentialEndDate,
        existingAssignments
      ):
        CONTINUE
      END IF

      // Valid assignment found!
      RETURN createAssignment(
        student.id,
        preceptor.id,
        clerkship.id,
        potentialStartDate,
        potentialEndDate
      )
    END FOR
  END FOR

  // No valid assignment found
  RETURN NULL
END FUNCTION


FUNCTION hasBlackoutConflict(startDate, endDate, blackoutDates):
  FOR EACH blackout IN blackoutDates:
    // Check if ranges overlap
    IF startDate <= blackout.end_date AND endDate >= blackout.start_date:
      RETURN TRUE
    END IF
  END FOR
  RETURN FALSE
END FUNCTION


FUNCTION hasPreceptorConflict(preceptorId, startDate, endDate, assignments):
  FOR EACH assignment IN assignments:
    IF assignment.preceptor_id == preceptorId:
      // Check if date ranges overlap
      IF startDate <= assignment.end_date AND endDate >= assignment.start_date:
        RETURN TRUE
      END IF
    END IF
  END FOR
  RETURN FALSE
END FUNCTION


FUNCTION hasStudentConflict(studentId, startDate, endDate, assignments):
  FOR EACH assignment IN assignments:
    IF assignment.student_id == studentId:
      // Check if date ranges overlap
      IF startDate <= assignment.end_date AND endDate >= assignment.start_date:
        RETURN TRUE
      END IF
    END IF
  END FOR
  RETURN FALSE
END FUNCTION


FUNCTION createAssignment(studentId, preceptorId, clerkshipId, startDate, endDate):
  RETURN {
    id: generateUUID(),
    student_id: studentId,
    preceptor_id: preceptorId,
    clerkship_id: clerkshipId,
    start_date: startDate,
    end_date: endDate,
    created_at: now(),
    updated_at: now()
  }
END FUNCTION
```

---

## Business Rules

### Rule 1: Specialty Matching
- Preceptor's specialty field must exactly match clerkship's specialty field
- Case-sensitive comparison
- Example: "Internal Medicine" preceptor can only teach "Internal Medicine" clerkship

### Rule 2: Date Range Overlap Detection
- Two date ranges overlap if: `start1 <= end2 AND end1 >= start2`
- Used for checking conflicts and availability

### Rule 3: Assignment Duration Calculation
- Duration in days = end_date - start_date + 1
- Must be >= clerkship.required_days
- Example: Jan 1 to Jan 28 = 28 days

### Rule 4: Sequential Assignment Priority
- Process students in order (by ID or name)
- Process clerkships in order for each student
- Each student gets all their rotations before moving to next student

### Rule 5: Blackout Date Handling
- If assignment overlaps any blackout date, skip that slot
- Try next available slot
- Blackout dates can overlap with each other

### Rule 6: Preceptor Capacity
- In MVP, max_students = 1 (one student at a time)
- Future: support max_students > 1

---

## Edge Cases

### Edge Case 1: Insufficient Preceptors
**Scenario:** More students need a specialty than preceptors available
**Handling:** Some students won't get assigned to that clerkship
**Result:** Partial schedule, warnings logged

### Edge Case 2: Insufficient Time Window
**Scenario:** Total required days > available days in window
**Handling:** Not all rotations will fit
**Result:** Partial schedule, warnings logged

### Edge Case 3: Blackout Dates Fragment Schedule
**Scenario:** Many blackout dates create small time fragments
**Handling:** Algorithm skips fragments too small for assignments
**Result:** Some rotations may not be assigned

### Edge Case 4: No Matching Specialty
**Scenario:** Clerkship requires specialty with no matching preceptors
**Handling:** Skip that clerkship for all students
**Result:** Clerkship unassigned, warning logged

### Edge Case 5: Preceptor Never Available
**Scenario:** Preceptor has no availability in scheduling window
**Handling:** Skip that preceptor
**Result:** Use other preceptors if available

### Edge Case 6: All Preceptors Fully Booked
**Scenario:** All matching preceptors have conflicts for available slots
**Handling:** Student doesn't get assigned to that clerkship
**Result:** Incomplete schedule for student

---

## Test Cases

### Test Case 1: Simple Assignment
**Setup:**
- 1 student
- 1 clerkship (28 days)
- 1 preceptor (matching specialty, available entire period)
- No blackout dates

**Expected Result:**
- 1 assignment created
- Assignment spans 28 days
- No conflicts

---

### Test Case 2: Multiple Sequential Assignments
**Setup:**
- 1 student
- 3 clerkships (28, 14, 28 days)
- 3 preceptors (one for each specialty, all available)
- 100-day window
- No blackout dates

**Expected Result:**
- 3 assignments created
- Assignments are sequential (no overlap, minimal gaps)
- Total duration = 70 days
- All within window

---

### Test Case 3: Preceptor Capacity Constraint
**Setup:**
- 2 students
- 1 clerkship (28 days)
- 1 preceptor (matching specialty, available entire period, max_students=1)
- No blackout dates

**Expected Result:**
- 2 assignments created
- Assignments do NOT overlap (sequential)
- Student 1: Days 1-28
- Student 2: Days 29-56

---

### Test Case 4: Blackout Date Avoidance
**Setup:**
- 1 student
- 1 clerkship (10 days)
- 1 preceptor (available days 1-30)
- Blackout: days 5-15

**Expected Result:**
- 1 assignment created
- Assignment either:
  - Days 1-10 (before blackout), OR
  - Days 16-25 (after blackout)
- Does NOT overlap days 5-15

---

### Test Case 5: No Matching Specialty
**Setup:**
- 1 student
- 1 clerkship (specialty: "Cardiology")
- 1 preceptor (specialty: "Internal Medicine")

**Expected Result:**
- 0 assignments created
- Warning logged

---

### Test Case 6: Insufficient Time Window
**Setup:**
- 1 student
- 2 clerkships (28, 28 days)
- 2 preceptors (matching, available)
- 30-day window

**Expected Result:**
- 1 assignment created (first clerkship)
- Second clerkship unassigned (insufficient time)
- Warning logged

---

### Test Case 7: Complex Multi-Student Schedule
**Setup:**
- 3 students
- 2 clerkships each (28, 14 days)
- 2 preceptors per specialty (all available)
- 200-day window
- Some blackout dates

**Expected Result:**
- Assignments distributed across preceptors
- No conflicts (student or preceptor)
- All students complete both rotations
- Blackout dates avoided

---

## Algorithm Complexity

### Time Complexity
- O(S × C × P × A) where:
  - S = number of students
  - C = number of clerkships
  - P = number of preceptors
  - A = average availability periods per preceptor

### Space Complexity
- O(S × C) for storing assignments
- O(B) for blackout dates
- O(P × A) for availability periods

### Performance Considerations
- For MVP: S ≤ 50, C ≤ 10, P ≤ 30, A ≤ 5
- Expected runtime: < 1 second
- Future optimization: indexing, caching, parallel processing

---

## Implementation Notes

**⚠️ This is documentation only. The user will implement the algorithm.**

When implementing:
1. Use TypeScript for type safety
2. Implement helper functions separately
3. Write comprehensive unit tests for each function
4. Test edge cases thoroughly
5. Log warnings for unassigned rotations
6. Return detailed results (assignments + warnings)
7. Consider transaction support for database operations
8. Validate all inputs before processing
9. Handle errors gracefully

---

## Future Enhancements

1. **Optimization Algorithms:**
   - Constraint programming solver
   - Genetic algorithms
   - Simulated annealing

2. **Advanced Features:**
   - Student preferences
   - Preceptor preferences
   - Multiple max_students per preceptor
   - Part-time preceptors
   - Recurring availability patterns

3. **Performance:**
   - Parallel processing
   - Incremental scheduling
   - Caching availability calculations

4. **Flexibility:**
   - Allow manual overrides
   - Support for schedule templates
   - Multi-year scheduling

---

## Acceptance Criteria

- [ ] Algorithm specification documented
- [ ] Pseudocode provided for all functions
- [ ] Business rules clearly defined
- [ ] All constraints documented
- [ ] Edge cases identified and described
- [ ] Test cases provided with expected results
- [ ] Complexity analysis documented
- [ ] Implementation notes provided
- [ ] Clear note that this is DOCUMENTATION ONLY

---

## References

- [Greedy Algorithms](https://en.wikipedia.org/wiki/Greedy_algorithm)
- [Constraint Satisfaction Problem](https://en.wikipedia.org/wiki/Constraint_satisfaction_problem)
- [Scheduling Algorithms](https://en.wikipedia.org/wiki/Scheduling_(computing))
- [Date Range Overlap Detection](https://stackoverflow.com/questions/325933/determine-whether-two-date-ranges-overlap)

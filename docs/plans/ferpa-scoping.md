# FERPA scoping decision (Phase 9, K2)

**Status:** decided — gates the K1 "send schedule" work.
**Scope:** what student schedule data the app may distribute, to whom, and the
minimum-necessary rule each recipient's view must honor. This document is the
contract the K1 code (`distribution-service`, the distribute API, and the send
dialog) implements and is unit-tested against.

> This is an engineering scoping decision for a training/demo product, not legal
> advice. It encodes a conservative, minimum-necessary posture so the send
> feature never leaks one student's record to another party.

---

## 1. What the data is

A schedule assignment ties a **student** (a person, with a name and email) to a
place and time — preceptor, clerkship, site, date, session. Under FERPA a
student's clinical placement schedule is part of their **education record**, and
their name + email are personally identifiable information (PII). The product
therefore treats every assignment row as student PII, not public data.

Fields that exist on/near an assignment and how each is classified:

| Field | Classification | May leave the app? |
| --- | --- | --- |
| student name | PII (identifies the record's subject) | only to that student, or to a party that must know who they are supervising |
| student email | PII, contact detail | only to the student themselves |
| preceptor name / site name / clerkship name | operational, not student PII | yes, to the parties involved |
| date / session (AM/PM/full) | education record when tied to a student | yes, scoped per recipient |
| assignment kind (clinical / free_day / exam) | education record | coarse label only (see §3) |
| `override_note`, `override_codes` | **sensitive** — free text / internal justifications, may reference health-system onboarding, capacity exceptions, or a student's circumstances | **never sent** to any external recipient |
| requirement progress / completion %, conflicts, health flags | internal analytics | **never sent** — coordinator-only |

---

## 2. Recipients and the minimum-necessary matrix

Three recipient types can be selected for a send. Each gets **only** the rows and
fields it needs to do its job. "Their own" is always evaluated against the
**active schedule only** (tenant scope, §5).

| Recipient | Rows it sees | Student identity shown | Never sees |
| --- | --- | --- | --- |
| **Preceptor** | only assignments whose `preceptor_id` = this preceptor | student **name** (a preceptor must know who they supervise), date, session, clerkship, site | any assignment with a different preceptor; any other preceptor's students; student email; override notes; progress/conflicts |
| **Student** | only assignments whose `student_id` = this student | their **own** name + email (it's their record) | any other student's rows entirely; other students' names; override notes |
| **Site** | only assignments whose `site_id` = this site | student **name**, date, session, clerkship, preceptor | assignments at other sites; student email; override notes; progress/conflicts |

The controlling invariant, stated as the FERPA assertion the unit tests prove:

> **A recipient's payload contains only rows scoped to that recipient, and never
> a field the matrix above marks as withheld.** In particular a preceptor's
> payload contains only their own students' days, a student's payload contains
> only their own days, and no payload ever carries an override note or another
> student's identity.

Non-clinical days (free_day / exam, Phase 8) have no preceptor/clerkship/site, so
they appear **only** in a student's own view, never in a preceptor's or site's
view (they have no `preceptor_id` / `site_id` to scope by — they naturally fall
out of those queries).

---

## 3. Fields sent per recipient (the exact payload shape)

Each recipient view is a list of day entries. Fields are included per the matrix:

- **Preceptor view** — `{ date, session, studentName, clerkshipName, siteName }`
- **Site view** — `{ date, session, studentName, clerkshipName, preceptorName }`
- **Student view** — `{ date, session, kind, clerkshipName?, preceptorName?, siteName? }`
  (a student sees their whole day incl. non-clinical exams/free days; clinical
  fields are present only on clinical days)

No view ever includes: `student_email` (except the student's own view, as a
header identifying the recipient to themselves), `override_note`,
`override_codes`, requirement/progress data, health-system onboarding state, or
any row outside the recipient's scope.

---

## 4. Audit / logging

Every send is recorded so a coordinator can answer "who received which student
data, and when". K1 writes one **`schedule_distributions`** row per
(send, recipient):

`{ id, schedule_id, sender_user_id, recipient_type, recipient_id, day_count, created_at }`

The audit row stores **counts and ids only — never the student data itself** — so
the log is not a second copy of the education record. A preview (dry run) does
**not** write an audit row; only a confirmed send does.

---

## 5. Tenant scope and consent assumptions

- **Tenant scope.** Every recipient query is scoped to the coordinator's active
  schedule and the entities in it (via the existing `assertScheduleOwnedByUser` /
  schedule-membership checks). A recipient id that is not in the active schedule
  is rejected before any data is read — cross-tenant sends are impossible.
- **Consent.** The product assumes the institution has the students' consent (or
  a FERPA "school official / legitimate educational interest" basis) to share a
  student's placement with the preceptor and site supervising that placement, and
  with the student themselves. The app does not itself collect per-send consent;
  it enforces minimum-necessary so that even under that basis no party receives
  more than their own slice.
- **Delivery.** K1 generates the per-recipient views and records the audit entry.
  Actual transport (email, printed hand-off, export file) is out of K1's trust
  boundary; the redaction happens **before** the payload leaves the service, so
  whatever the transport, it can only carry the minimum-necessary view.

---

## 6. What K1 must implement (derived from the above)

1. `buildRecipientView(db, scheduleId, { type, id })` → the scoped, redacted day
   list for one recipient, per §2/§3. Pure of transport.
2. A distribute API that previews (no audit write) and sends (writes audit rows),
   owner-guarded and tenant-scoped, rejecting any recipient not in the schedule.
3. A send dialog: multi-select recipients across the three types, preview each
   recipient's view, confirm the send.
4. Unit tests proving the §2 invariant (the FERPA assertion) and §5 tenant scope;
   an e2e (`CF-K1`) proving the preview shows only a preceptor's own students and
   the send confirms.

Anything beyond this list (real email transport, per-send consent capture, the
1-exam-per-quarter rule) is out of Phase 9 scope.

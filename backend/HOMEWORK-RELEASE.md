# Homework V1

Administrators use `zhixu/homework.html` from the existing portal. Select a course, one or more authorized students, exercise sets, a title and a deadline. Students use the same page to see only their own homework and open the exact set. This version uses student selection rather than a separate class roster.

## Counting rules

- One item per student per set; one batch can contain multiple students and sets.
- Deadline is 23:59:59.999999 Asia/Singapore on the selected date.
- The first full submission after publication completes the item, whether opened through homework or free practice. Earlier submissions do not count. Repeated submissions do not inflate completion or replace the first-submission timeliness.
- An unfinished active assignment for the same student and set prevents overlapping publication. Completed work may be assigned again for another practice round.
- Publication UUID makes an identical network retry idempotent. Cancellation removes the entire batch from active lists and newly generated statistics; learning records and saved historical reports remain intact.
- Monthly homework counts use deadline month. Existing practice statistics remain separate. Saved reports require refresh and save to include or update homework totals.

## Deployment

1. Run `backend/homework-schema.sql` once in the existing database. It adds two private RLS-protected tables, a service-only gateway, a first-submission query and a monthly-statistics wrapper. It renames the original month_snapshot to practice_month_snapshot; do not rerun the migration.
2. Deploy `backend/reports.ts` with `backend/security.ts`, entrypoint `reports.ts`, to the existing `zhixu-reports` function. Authentication stays inside the handler, including hashed student sessions and verified administrator identity. Existing start/finish and report operations retain their gateway.
3. Publish the updated portal/reports files and new homework.html/homework.js.
4. Verify service-only grants, current report totals and gateway authentication. Do not publish homework to real students merely to test deployment.

## Validation

`deno test --allow-read --allow-env tests/homework_test.ts tests/homework_ui_test.ts tests/homework_handler_test.ts tests/reports_test.ts tests/reports_ui_test.ts tests/report_hooks_test.ts tests/security_test.ts`

The course-content launch test uses the generated report-content.json and report-catalog.json already produced by build-reporting.ts (these generated assets are not checked in). It opens the first and last set across all 13 existing assets and checks the actual start event. Database tests run in PGlite with synthetic identities and records. No test student, session or homework is inserted into production.

## History update

Run homework-history.sql once after homework-schema.sql, then redeploy reports.ts and publish homework.html/homework.js. Students default to unfinished work across all months; administrators default to all statuses due in the current Singapore month. Switching to unfinished work clears the month so old overdue work remains visible. Completed and closed work is available through History and the month selector.

Closing a batch preserves all assignments and first submissions up to the closing time, blocks later submissions from rewriting its history, and permits reassignment. Monthly totals still include closed assignments and their unsubmitted records. Cancellation retains its original meaning of removing an erroneous batch from new statistics. No records are deleted.

## Individual closure and submission enforcement

Run homework-student-close.sql after homework-history.sql. It adds a per-student/per-set closed_at (the admin action closes all sets for one student in a batch). The earliest of batch and item closure freezes first-submission matching. Neither individual nor batch closure removes assigned items from monthly denominators.

Homework URLs carry their batch ID. Opening and start/finish submissions from that context are checked on the server. A closed or cancelled assignment cannot be submitted through its homework context; free practice without a homework context remains available and does not change a closed assignment. An open page whose homework is ended gets a closure message and a free-practice link instead of retrying the blocked submission.

Deploy reports.ts; publish homework.html/homework.js, portal.html/portal.js and learning-records.js. Existing records are untouched. Regression tests include four students, three preserved submissions, one individually closed incomplete assignment, rejected homework submission, and successful free practice that leaves the closed homework incomplete.

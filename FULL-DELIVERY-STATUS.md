# Full delivery status — implementation notes

## Implemented in this package

- Teacher exam creation and editing, MCQ question/options/correct-answer/marks management, publish status, exam duration, auto-submit countdown, optional negative marking.
- Server-side attempt ownership and duration checks; result score/percentage/correct/wrong/unanswered counts; teacher result list and question response distribution.
- Teacher assignment publishing; student document upload; teacher submission list, download, grading and feedback; pending/submitted/graded/late state.
- Teacher Present/Absent/Late attendance entry; student check-in when joining a live classroom; monthly attendance summaries; personal absent notifications.
- Completed lecture history and teacher-managed external recording links.
- Proctor warning event persistence, exam-wise event logs and review-priority analytics; existing MediaPipe multiple-face/head/gaze panel retained and connected to event logging in scheduled assessments.
- Admin user create/list/role update/password reset/deactivation; classroom/subject create/edit/deactivation.
- PBKDF2 password hashing for newly created users, migration of legacy plain passwords on successful login, signed expiring bearer tokens, and role checks on administrative and academic write/report endpoints.

## Deliberate limitations

- AI quiz generation still needs a configured model/API; it is not falsely labelled as live AI.
- Live attendance is a join/check-in signal. Automatically marking every absent student requires a maintained roster/enrollment source and end-of-session reconciliation.
- Recording management stores a link to an externally generated recording; LiveKit Egress/cloud recording is not provisioned automatically.
- Proctor signals and review-priority scores are not proof of misconduct. Human review is required.
- Audio/speech classification is not included; current proctoring is camera/landmark based.
- PostgreSQL DDL and adapter support are included, but local integration tests were run against SQLite only. Validate against your own PostgreSQL database before deployment.
- A full Vite production build was not run because dependency installation timed out in this environment. All JSX/JS files passed TypeScript's JSX syntax transpilation check.

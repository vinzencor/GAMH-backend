# Journal Submission & Review Workflow — Implementation Spec

> **Superseded by `gamh-master-development-plan.md`** for planning purposes — that document formalizes everything below (Sections 1–13) plus the full platform build-out (journal/volume/issue management, payments/APC, editorial role hierarchy, reviewer matching, plagiarism check, co-authors, licensing, post-publication, SLA handling, account security, compliance) with state diagrams, schema, API endpoints, UI screens, edge cases, and a phased build order. This file is kept for the open-question answers already resolved inline below.

## 0. Context for the agent
Implement/extend a system with the following actors: **User (Author)**, **Super Admin**, **Reviewer**, and optionally **Supervisor/Editor** (a role that can be assigned editor-level approval power, possibly held by Super Admin or a separate user). Treat every section below as a mandatory requirement unless explicitly marked "Open question." Ask for clarification on any open question before writing code if the answer changes the data model.

---

## 1. Roles

| Role | Capabilities |
|---|---|
| **User (Author)** | Pay for membership, submit journals, pay per-journal fee, upload payment proof, withdraw own journals, view own journal status/history |
| **Super Admin** | View/manage all journal submissions, approve/reject submissions, assign workflow OR assign reviewer directly, view reports, receive withdrawal requests, manage workflows |
| **Reviewer** | Accept or reject an assigned review, add notes on rejection, review within the assigned workflow stage |
| **Supervisor/Editor** (configurable) | Can act with editor-level powers — must also verify/approve a journal in addition to (or as part of) the standard workflow approval |

---

## 2. Core Entities (data model)

Adapt names to your existing stack/ORM, but every field below must be represented somewhere.

### 2.1 `User`
- Standard auth fields
- `membershipStatus`: `UNPAID | PENDING_APPROVAL | ACTIVE | EXPIRED`
- `membershipId` (FK to Membership/Payment record)

### 2.2 `Membership`
- `userId`
- `plan`, `amount`, `paymentStatus`: `PENDING | PAID | APPROVED | REJECTED`
- `paymentProofUrl` (S3)
- `approvedAt`, `approvedBy`

### 2.3 `JournalSubmission`
- `id`, `userId`
- `status` (see state machine in Section 4 — this is the most important field in the whole system)
- `currentStep`: tracks exactly where the user left off (see Section 4.3) — **must persist to DB on every step, not just client state**
- `title`, `abstract`, `fileUrl` (S3), other journal metadata fields
- `paymentStatus`: `UNPAID | AWAITING_VERIFICATION | PAID`
- `paymentProofUrl` (S3)
- `paymentAmount`, `paidAt`
- `submittedAt`
- `adminApprovedAt`, `adminApprovedBy`
- `workflowId` (FK, nullable until assigned)
- `currentWorkflowStageId` (nullable)
- `assignedReviewerId` (nullable — for direct assignment, separate from workflow-based assignment)
- `withdrawnAt`, `withdrawalReason` (nullable)
- `createdAt`, `updatedAt`

### 2.4 `Workflow`
- `id`, `name`, `description`, `isActive`
- Ordered list of `WorkflowStage`s (each stage = a reviewer role/step, sequence number)

### 2.5 `WorkflowStage`
- `workflowId`, `sequenceOrder`, `reviewerId` (or reviewer role/pool), `isEditorStage` (bool — flags a stage that requires Supervisor/Editor sign-off)

### 2.6 `ReviewAssignment`
- `journalSubmissionId`, `reviewerId`, `workflowStageId` (nullable if direct-assigned, not via workflow)
- `status`: `PENDING | ACCEPTED | REJECTED`
- `decisionNotes` (required if rejected)
- `decidedAt`

### 2.7 `WithdrawalRequest`
- `journalSubmissionId`, `userId`, `reason` (required, free text)
- `requestedAt`
- (Optional — confirm with stakeholder) `status`: auto-processed immediately vs. requires Super Admin approval

### 2.8 `Notification`
- `userId` (recipient — could be reviewer, author, or admin)
- `type`: `REVIEW_ASSIGNED | REVIEW_ACCEPTED | REVIEW_REJECTED | JOURNAL_WITHDRAWN | SUBMISSION_APPROVED | ...`
- `message`, `relatedJournalId`, `read`, `createdAt`

---

## 3. Membership Flow

1. User signs up / logs in.
2. User must pay for membership before getting full account access.
3. User uploads/submits e-payment details (and proof — confirm if proof is required at membership stage too, or only at journal stage; spec explicitly requires it at journal stage).
4. Membership payment goes to `PENDING_APPROVAL`.
5. **Super Admin must approve the membership payment** before the user account becomes `ACTIVE` / before the user can log in and use the dashboard.
6. Once `ACTIVE`, user logs in and lands on a Dashboard that fetches and displays:
   - Membership details/status
   - Journal submission history and current statuses

> **Open question:** Does "approval" gate the login itself (user literally cannot authenticate until approved), or does it gate access to journal submission only (user can log in but sees a "pending approval" screen)? Confirm before building auth guards.

---

## 4. Journal Submission Flow (core feature — must be resilient to interruption)

### 4.1 Steps in order
1. User starts a new journal submission (fills metadata/uploads paper).
2. User is prompted to pay the per-journal submission fee.
3. User submits payment details and **uploads payment proof**.
4. Payment proof file is uploaded to **AWS S3**; the URL/key is saved on the `JournalSubmission` record.
5. Once payment is confirmed/proof is submitted, the journal status moves to `SUBMITTED` and becomes visible to Super Admin.
6. Journal is **not considered accepted/valid** until this payment step is complete — no payment, no valid submission.

### 4.2 Status state machine (suggested)
```
DRAFT
  → PAYMENT_PENDING
  → PAYMENT_PROOF_UPLOADED   (awaiting admin/system verification, if any)
  → SUBMITTED                (visible to Super Admin)
  → UNDER_ADMIN_REVIEW
  → ADMIN_APPROVED
  → WORKFLOW_ASSIGNED        (or REVIEWER_ASSIGNED if direct)
  → IN_REVIEW
  → REVIEW_ACCEPTED / REVIEW_REJECTED (per stage)
  → COMPLETED
  -----------------------------------
  → WITHDRAWN  (can branch off from any non-terminal state — see Section 7)
```

### 4.3 Save & Resume — mandatory, must cover every edge case
This is explicitly called out as critical. Requirements:

- **Every step transition must be persisted server-side immediately** (not just in browser/local state). If the user fills part of a form and the browser crashes mid-typing, at minimum the *last completed step* must be recoverable; ideally autosave drafts of in-progress fields too (debounced autosave to backend).
- `currentStep` (or equivalent) on `JournalSubmission` must always reflect the furthest *completed* step.
- When the user closes the tab, hits back, refreshes, or loses connection **at any point** — including:
  - mid-form-fill (before first save)
  - after metadata saved but before payment started
  - after payment initiated but before proof uploaded
  - after proof uploaded but before final confirmation
- ...the system must, on next login, route the user back to **exactly** that step (e.g., "Resume Payment" → payment page; "Resume Submission" → upload-proof page) — never force them to restart from scratch, and never silently lose data.
- Dashboard should show an explicit "Incomplete Submission" card/banner with a CTA to resume, distinct from completed submissions.
- Define idempotency: if a user double-submits payment proof (e.g., double-click, or resumes and re-uploads), do not create duplicate `JournalSubmission` records — update the existing draft record.
- Define a sensible timeout/expiry policy for abandoned drafts (confirm with stakeholder — e.g., auto-expire drafts after X days, or keep indefinitely). **Open question.**

### 4.4 Payment proof → S3
- On upload, file goes directly to AWS S3 (use signed URLs / direct upload pattern to avoid routing large files through the app server, if consistent with existing infra).
- Store the resulting S3 key/URL, content type, upload timestamp on the submission record.
- Validate file type/size before/at upload.

---

## 5. Super Admin: Journal Submissions Module

A new admin section/module: **Journal Submissions**, with:

- A list/table of all submitted journals across all users, with filters by status, user, date, workflow.
- Detail view per journal: metadata, payment proof, current status, assigned workflow/reviewer, review history.
- **Reporting**: count of journals submitted per user, totals by status (submitted / approved / in review / completed / withdrawn / rejected), exportable if your existing admin reports support export.
- Actions available to Super Admin per journal:
  1. **Approve** the submission (required gate before anything else proceeds).
  2. After approval, **choose how it proceeds to review** — two options:
     - **Assign a Workflow**: system fetches all existing/active `Workflow` records, admin picks one. The journal then follows that workflow's stages and reviewer sequence automatically.
     - **Direct-assign a Reviewer**: admin picks a specific reviewer as the **first/core reviewer**, bypassing (or seeding) a workflow.
  3. If a workflow is later/already assigned to a reviewer, the system should check whether that reviewer has a workflow assignment and behave according to that workflow's stage rules (i.e., direct assignment and workflow assignment are not mutually exclusive — direct assignment may itself just be "assign to stage 1 of a workflow").
- Super Admin can also act as / designate a **Supervisor-Editor**: this role must independently verify and approve the journal as an editor step, in addition to the workflow's reviewer approvals (i.e., editor sign-off is a separate gate from reviewer sign-off).

---

## 6. Workflow & Reviewer Assignment

- `Workflow` = an ordered sequence of stages, each with an assigned reviewer (or reviewer pool/role).
- When a journal is assigned a workflow, it enters stage 1 automatically, notifying the stage-1 reviewer.
- Reviewer for a given stage can:
  - **Accept** the review → journal proceeds, status updates, notification sent to author/admin.
  - **Reject** the review → reviewer **must provide notes/reason** for rejection. This is sent as a notification (to admin and/or author — confirm which) explaining *why* it was rejected.
- On rejection, define what happens next: does it go back to Super Admin for re-assignment, or does the whole journal get rejected? **Open question — confirm before building the rejection branch.**
- Editor stage (if `isEditorStage` is true) requires the Supervisor/Editor to also approve, independent of the regular reviewer chain.

---

## 7. Withdrawal Flow

1. The journal's **author (User)** can withdraw their own journal at any point it's active in a workflow.
2. Withdrawal requires the user to provide a **specific reason** (required field, not optional).
3. The withdrawal request is sent to **Super Admin**.
4. On withdrawal:
   - The journal's active workflow is **immediately stopped** — no further stage transitions occur.
   - The journal is **removed from view for all reviewers** currently assigned to it (any stage) — they should no longer see it in their queue/dashboard.
   - Journal status moves to `WITHDRAWN`, with `withdrawalReason` and `withdrawnAt` recorded.
5. Confirm: does withdrawal need Super Admin **approval** before taking effect, or does it take effect immediately and Super Admin is just **notified**? Your description says "the request should go to the super admin to withdraw," which could mean either. **Open question — recommend confirming, as it changes whether `WithdrawalRequest` needs a `status` field of its own.**

---

## 8. Notifications (cross-cutting)

Trigger notifications for at least:
- Membership approved
- Journal submission approved by admin
- Reviewer assigned (workflow-based or direct)
- Reviewer accepted / rejected (rejected must include the reviewer's notes)
- Journal withdrawn (to admin, and to any reviewers who lose access)

Decide delivery channel(s) — in-app notification table is the minimum; email/push are additive if your stack already supports them.

---

## 9. Non-negotiable edge cases checklist

- [ ] No journal is treated as "submitted" without confirmed/uploaded payment proof.
- [ ] No duplicate `JournalSubmission` rows created on resume/retry — always update the existing draft.
- [ ] Resume logic correctly reconstructs *exact* step (payment vs. upload vs. metadata) after browser close/back button/refresh/network loss, with state persisted server-side at every step, not just client-side.
- [ ] Withdrawing a journal stops the workflow immediately and revokes reviewer visibility — verify this with an authorization check on every reviewer-facing query, not just a UI hide.
- [ ] Reviewer rejection without notes should be blocked at validation level (notes required).
- [ ] Super Admin sees accurate, real-time counts/reports per user (submitted, approved, withdrawn, completed).
- [ ] S3 uploads validated (type/size) and access-controlled (signed URLs, not public buckets) for payment proofs.
- [ ] Editor/Supervisor approval, where applicable, is tracked as a distinct gate from reviewer approval — a journal isn't "complete" until both are satisfied (if editor stage is configured).

---

## 10. Open questions to resolve before/while building
1. Does membership "approval" block login entirely, or just block journal submission?
2. Is payment proof required at the membership stage too, or only at the per-journal stage?
3. Draft expiry policy for abandoned/incomplete journal submissions — keep forever, or auto-expire?
4. On reviewer rejection, does the journal return to Super Admin for re-assignment, or is it terminally rejected?
5. Does a withdrawal request need explicit Super Admin approval before it takes effect, or is it immediate-with-notification?
6. Is the Supervisor/Editor role a separate user account, or a flag/capability on the Super Admin account?

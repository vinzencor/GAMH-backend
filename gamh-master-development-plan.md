# GAMH — Master Development Plan
## Academic Journal Management Platform — Full System Spec

> **Stack assumption for this document:** Node.js/Express, TypeScript, Prisma + PostgreSQL, AWS EC2 — as specified by the product owner for this plan.
> **Stack note:** the current GAMH-Backend codebase in this repo runs Mongoose/MongoDB on plain JS, not Prisma/Postgres. This document is written in Prisma schema style per the spec request; if building directly on top of the existing codebase rather than a fresh service, the Prisma models below translate 1:1 to Mongoose schemas (see "Schema" sections — field lists carry over, only the ORM syntax changes).
> This document **supersedes** `journal-workflow-spec.md` for planning purposes. Status names below are the canonical names — do not rename.
> **Deferred — not needed right now:** Section J (Account & Security: email verification, password reset, 2FA, role-switcher UI) is descoped from the active build. The schema/API/UI for it stays documented below for later, but it is **not in any current phase** of Part 3's build order. Basic login/auth already exists in the live app and is out of scope for this round.
> **Assignment model — resolved:** the earlier "direct-assign a Reviewer, bypassing a workflow" path described in Section 5 and old `journal-workflow-spec.md` Section 5 is **removed**. A paper can only ever be assigned to a **Workflow**. Direct-to-reviewer assignment doesn't exist as a separate path — see the new **Section L (Paper Review Queue)** below, which is the actual assignment UI: Super Admin picks a paper, assigns it to a Workflow (which may be a single-reviewer or single-sub-admin workflow if that's all it needs), and the workflow's stage progression takes over from there.

---

## 0. Roles (final list)

| Role | Scope |
|---|---|
| **Member** | Base authenticated role. Pays membership, browses content/library, holds the account multiple other roles attach to. |
| **Author** | Submits papers, manages own submissions, pays APC, manages co-authors, requests corrections post-publication. |
| **Reviewer** | Accepts/declines review invitations, submits reviews, manages workload/availability. |
| **Associate/Section Editor** | Screens submissions, invites reviewers, recommends decisions. Cannot finalize accept/reject. |
| **Managing Editor** | Payments, certificates, publication scheduling, journal/issue admin, non-academic operations. |
| **Editor-in-Chief** | Final accept/reject authority, journal-wide settings, overrides. |
| **Super Admin** | Platform-wide — user/role management, all journals, system config, security/compliance. |

A single `User` account can hold **Member + Author + Reviewer** simultaneously (existing rule, unchanged). Editorial roles (Associate Editor, Managing Editor, Editor-in-Chief, Super Admin) are **scoped per-Journal** (one user can be Editor-in-Chief of Journal A and Associate Editor of Journal B) — see Section C.

---

## PART 1 — EXISTING WORKFLOWS (formalized, not redesigned)

### 1. Membership Workflow

**States:** `REGISTERED → APPLIED → PROFILE_UPLOADED → PAYMENT_PENDING → PAYMENT_SUBMITTED → ADMIN_REVIEW → ACTIVE` (or `REJECTED`)

**Transitions/triggers:**
- `REGISTERED → APPLIED`: user submits membership application form
- `APPLIED → PROFILE_UPLOADED`: profile fields + documents uploaded
- `PROFILE_UPLOADED → PAYMENT_PENDING`: system generates fee invoice
- `PAYMENT_PENDING → PAYMENT_SUBMITTED`: user pays / uploads proof
- `PAYMENT_SUBMITTED → ADMIN_REVIEW`: auto-transition, lands in Super Admin queue
- `ADMIN_REVIEW → ACTIVE`: Super Admin approves
- `ADMIN_REVIEW → REJECTED`: Super Admin rejects (reason required)

**Schema (Prisma):**
```prisma
model Membership {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id])
  plan            String
  amount          Decimal
  paymentStatus   MembershipStatus @default(APPLIED)
  paymentProofUrl String?
  rejectionReason String?
  approvedAt      DateTime?
  approvedById    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
enum MembershipStatus { APPLIED PROFILE_UPLOADED PAYMENT_PENDING PAYMENT_SUBMITTED ADMIN_REVIEW ACTIVE REJECTED }
```

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/membership/apply` | Create membership application |
| PATCH | `/api/membership/:id/profile` | Upload profile fields/docs |
| POST | `/api/membership/:id/payment` | Submit payment + proof |
| GET | `/api/membership/me` | Current user's membership status |
| GET | `/api/admin/memberships?status=` | Super Admin queue |
| PATCH | `/api/admin/memberships/:id/approve` | Approve |
| PATCH | `/api/admin/memberships/:id/reject` | Reject (reason required) |

**UI:**
- Member: Registration form → Profile form → Payment page → "Pending Approval" status screen
- Super Admin: Membership Queue (table, filters by status) → Detail drawer (profile, proof, Approve/Reject buttons)

**Edge cases:** duplicate applications from same email; payment proof re-upload after rejection should reset to `PAYMENT_SUBMITTED` not create a new record; partial profile saves must persist (autosave).

---

### 2. Paper Submission Workflow (Editorial Screening)

**States:** `DRAFT → SUBMITTED → SCREENING → ` one of 10 outcomes:
`MOVE_TO_REVIEW | FORMATTING_CORRECTION | MISSING_DOCS | MINOR_EDITS | FORMATTING_REJECTED | OUT_OF_SCOPE | PLAGIARISM_CONCERN | DUPLICATE_CONCERN | AUTHOR_CONFLICT | DESK_REJECT`

`FORMATTING_CORRECTION | MISSING_DOCS | MINOR_EDITS` loop back to `SUBMITTED` after author resubmits (see SLA module, Section I). `FORMATTING_REJECTED | OUT_OF_SCOPE | PLAGIARISM_CONCERN | DUPLICATE_CONCERN | AUTHOR_CONFLICT | DESK_REJECT` are terminal-negative (paper closed, author notified with reason). `MOVE_TO_REVIEW` proceeds to Reviewer Invitation Workflow (Section 3).

**Schema:**
```prisma
model Submission {
  id                 String   @id @default(cuid())
  journalId          String
  volumeId           String?
  issueId            String?
  title              String
  abstract           String
  manuscriptUrl      String
  status             SubmissionStatus @default(DRAFT)
  screeningOutcome   ScreeningOutcome?
  screeningNotes     String?
  screenedById       String?
  screenedAt         DateTime?
  authorId           String
  correspondingAuthorId String
  submittedAt        DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
enum SubmissionStatus { DRAFT SUBMITTED SCREENING NEEDS_AUTHOR_ACTION IN_REVIEW DECIDED PUBLISHED WITHDRAWN }
enum ScreeningOutcome {
  MOVE_TO_REVIEW FORMATTING_CORRECTION MISSING_DOCS MINOR_EDITS
  FORMATTING_REJECTED OUT_OF_SCOPE PLAGIARISM_CONCERN DUPLICATE_CONCERN
  AUTHOR_CONFLICT DESK_REJECT
}
```

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/submissions` | Create draft |
| PATCH | `/api/submissions/:id/submit` | Submit for screening |
| GET | `/api/editor/submissions?status=SCREENING` | Screening queue |
| PATCH | `/api/editor/submissions/:id/screen` | Apply screening outcome |
| GET | `/api/author/submissions` | Author's own list |

**UI:**
- Author: Submission Wizard (metadata → upload → co-authors → review → submit), Submission detail with screening outcome banner
- Associate Editor: Screening Queue, Screening Decision modal (outcome dropdown + notes, notes required for all reject-type outcomes)

**Edge cases:** screening outcome notes mandatory for any non-`MOVE_TO_REVIEW` outcome; resubmission after `MISSING_DOCS` must diff what changed for editor visibility; `AUTHOR_CONFLICT` must auto-flag if author/editor share institution (cross-ref Section D conflict logic).

---

### 3. Reviewer Invitation Workflow

**States:** `INVITED → ACCEPTED | DECLINED | NO_RESPONSE | COI_DECLARED | OUTSIDE_EXPERTISE`

**Transitions:** `INVITED` auto-expires to `NO_RESPONSE` after SLA window (Section I). `ACCEPTED` creates active `ReviewAssignment`. Any non-accept outcome returns the slot to the editor's invite queue.

**Schema:**
```prisma
model ReviewInvitation {
  id           String   @id @default(cuid())
  submissionId String
  reviewerId   String
  status       InvitationStatus @default(INVITED)
  declineReason String?
  redactedAbstractSentAt DateTime @default(now())
  respondedAt  DateTime?
  expiresAt    DateTime
}
enum InvitationStatus { INVITED ACCEPTED DECLINED NO_RESPONSE COI_DECLARED OUTSIDE_EXPERTISE }
```

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/editor/submissions/:id/invite-reviewer` | Send invitation |
| GET | `/api/reviewer/invitations` | Reviewer's pending invitations |
| PATCH | `/api/reviewer/invitations/:id/respond` | Accept/decline/COI/outside-expertise |

**UI:**
- Reviewer: Invitations list (redacted abstract preview, Accept/Decline/Decline-with-reason buttons)
- Associate Editor: Invitation tracker per submission (status per invited reviewer, re-invite action)

**Edge cases:** redacted abstract must strip author names/affiliations server-side, not client-side; `COI_DECLARED` should feed back into Section D's exclusion list for that reviewer+submission pair permanently.

---

### 4. Super Admin Reviewer Approval

**States:** `APPLIED → APPROVED | REJECTED | NEEDS_VERIFICATION`

**Schema:**
```prisma
model ReviewerProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  status    ReviewerApprovalStatus @default(APPLIED)
  verificationNotes String?
  approvedById String?
  approvedAt DateTime?
}
enum ReviewerApprovalStatus { APPLIED APPROVED REJECTED NEEDS_VERIFICATION }
```

**API:** `GET /api/admin/reviewers?status=`, `PATCH /api/admin/reviewers/:id/approve`, `PATCH /api/admin/reviewers/:id/reject`, `PATCH /api/admin/reviewers/:id/request-verification`

**UI:** Super Admin: Reviewer Applications queue, Detail view (credentials, ORCID link, Approve/Reject/Request Verification).

**Edge cases:** `NEEDS_VERIFICATION` should re-notify the applicant with what's missing, and re-queue on resubmission rather than restart.

---

### 5. Review Submission (10 recommendation types)

**Recommendation enum:** `ACCEPT_AS_IS | MINOR_REVISION | MAJOR_REVISION | REVISE_RESUBMIT | REJECT_OUT_OF_SCOPE | REJECT_METHODOLOGY | REJECT_PLAGIARISM | REJECT_QUALITY | UNABLE_TO_REVIEW | REQUEST_EXTENSION`

**Schema:**
```prisma
model Review {
  id              String   @id @default(cuid())
  invitationId    String   @unique
  submissionId    String
  reviewerId      String
  recommendation  Recommendation
  commentsToAuthor String
  commentsToEditor String?
  attachmentUrl   String?
  submittedAt     DateTime?
  extensionRequestedDays Int?
}
enum Recommendation {
  ACCEPT_AS_IS MINOR_REVISION MAJOR_REVISION REVISE_RESUBMIT
  REJECT_OUT_OF_SCOPE REJECT_METHODOLOGY REJECT_PLAGIARISM REJECT_QUALITY
  UNABLE_TO_REVIEW REQUEST_EXTENSION
}
```

**API:** `POST /api/reviewer/reviews` (submit), `PATCH /api/reviewer/reviews/:id/request-extension`, `GET /api/editor/submissions/:id/reviews`

**UI:** Reviewer: Review Form (recommendation radio group with 4 reject subtypes nested, comments to author / confidential comments to editor, file attach), Editor: Reviews-in summary table per submission.

**Edge cases:** `REQUEST_EXTENSION` is not a final recommendation — it pauses the SLA clock once, must auto-revert to original due-date tracking after the extension is consumed; `UNABLE_TO_REVIEW` should trigger an immediate re-invite flow, not just sit idle.

---

### 6. Review Quality Check

**States (per review):** `ACCEPTED | WEAK | BIASED | INCOMPLETE | CONFIDENTIAL_BREACH | MISSED_DEADLINE`

**Schema:**
```prisma
model ReviewQualityFlag {
  id        String   @id @default(cuid())
  reviewId  String   @unique
  flag      QualityFlag
  flaggedById String
  notes     String?
  createdAt DateTime @default(now())
}
enum QualityFlag { ACCEPTED WEAK BIASED INCOMPLETE CONFIDENTIAL_BREACH MISSED_DEADLINE }
```

**API:** `PATCH /api/editor/reviews/:id/quality-check`

**UI:** Managing/Associate Editor: Review detail page with quality-check selector; flags other than `ACCEPTED` feed a private "reviewer reliability" indicator on the reviewer's profile (visible to editors only, used for future invite weighting in Section D).

**Edge cases:** `CONFIDENTIAL_BREACH` and `BIASED` should auto-notify Editor-in-Chief regardless of who flagged it; flagged reviews still count toward the editorial decision unless explicitly excluded by Editor-in-Chief.

---

### 7. Editorial Decision (9 outcomes)

**Outcome enum:** `ACCEPTED | MINOR_REVISION | MAJOR_REVISION | REVISE_RESUBMIT | REJECTED | REJECTED_AFTER_REVIEW | ETHICS_REJECTION | WITHDRAWN_BY_AUTHOR | WITHDRAWN_BY_ADMIN`

**Authority:** only **Editor-in-Chief** can finalize `ACCEPTED`, `REJECTED`, `REJECTED_AFTER_REVIEW`, `ETHICS_REJECTION` (cross-ref Section C). Associate Editor can *recommend* any outcome but the record stays `PENDING_EIC_CONFIRMATION` until Editor-in-Chief signs off.

**Schema:**
```prisma
model EditorialDecision {
  id            String   @id @default(cuid())
  submissionId  String   @unique
  outcome       DecisionOutcome
  recommendedById String
  confirmedById String?
  confirmedAt   DateTime?
  decisionLetter String
  createdAt     DateTime @default(now())
}
enum DecisionOutcome {
  ACCEPTED MINOR_REVISION MAJOR_REVISION REVISE_RESUBMIT REJECTED
  REJECTED_AFTER_REVIEW ETHICS_REJECTION WITHDRAWN_BY_AUTHOR WITHDRAWN_BY_ADMIN
}
```

**API:** `POST /api/editor/submissions/:id/recommend-decision`, `PATCH /api/eic/submissions/:id/confirm-decision`

**UI:** Associate Editor: Decision Recommendation form (outcome + aggregated reviews + decision letter draft). Editor-in-Chief: Confirmation queue (all pending `ACCEPTED`/reject-type decisions awaiting sign-off).

**Edge cases:** `ACCEPTED` is the APC trigger point (see Section B) — must fire the payment-request event exactly once, on the `confirmedAt` transition, not on recommendation; `ETHICS_REJECTION` should auto-link to Section E's plagiarism/similarity record if one exists.

---

### 8. Author Revision Workflow

**States:** `REVISION_REQUESTED → AUTHOR_EDITING → RESUBMITTED → RE_SCREENING`

Re-enters the review cycle at the stage the editor specifies (back to same reviewers for `MINOR_REVISION`/`MAJOR_REVISION`; back to screening for `REVISE_RESUBMIT`, which is treated as a fresh round).

**Schema:** `Submission.revisionRound: Int @default(0)`, incremented each time; `Submission.revisionDueAt: DateTime` (SLA, Section I).

**API:** `POST /api/author/submissions/:id/revisions` (new file + response-to-reviewers letter), `GET /api/author/submissions/:id/revision-history`

**UI:** Author: Revision Required banner with reviewer comments compiled, Revision Upload form (new manuscript + point-by-point response letter, required field).

**Edge cases:** point-by-point response letter should be mandatory for `MINOR_REVISION`/`MAJOR_REVISION`, optional-but-recommended for `REVISE_RESUBMIT` (new round); track `revisionRound` so reviewers can diff this version against the last.

---

### 9. Acceptance & Certificate Generation

**Trigger:** `EditorialDecision.outcome = ACCEPTED` and `confirmedAt` set.

**Schema:**
```prisma
model Certificate {
  id           String   @id @default(cuid())
  submissionId String
  type         CertificateType
  recipientId  String
  pdfUrl       String
  issuedAt     DateTime @default(now())
}
enum CertificateType { AUTHOR_ACCEPTANCE AUTHOR_PUBLICATION REVIEWER_PARTICIPATION REVIEWER_OUTSTANDING }
```

**API:** `POST /api/system/certificates/generate` (internal, triggered by decision confirmation event), `GET /api/certificates/:id/download`

**UI:** Author: Certificates tab on dashboard. Reviewer: Certificates tab (participation cert per completed review cycle). Managing Editor: re-issue/regenerate action.

**Edge cases:** certificate PDFs must be regenerated (not just re-served) if author name/title changes after issuance; reviewer certs should only fire once review is marked `ACCEPTED` quality (Section 6), not on submission alone.

---

### 10. Publication Workflow

**States:** `READY_TO_PUBLISH → PUBLISHED` with sub-modes `IMMEDIATE | SCHEDULED | DOI_PENDING`. Post-publish: `RETRACTED`, `CORRECTED` (cross-ref Section H).

**Schema:**
```prisma
model Publication {
  id            String   @id @default(cuid())
  submissionId  String   @unique
  issueId       String?
  publishMode   PublishMode
  scheduledFor  DateTime?
  doi           String?
  doiStatus     DoiStatus @default(NOT_REQUESTED)
  publishedAt   DateTime?
  retractedAt   DateTime?
  retractionNotice String?
}
enum PublishMode { IMMEDIATE SCHEDULED DOI_PENDING }
enum DoiStatus { NOT_REQUESTED REQUESTED REGISTERED FAILED }
```

**API:** `POST /api/managing-editor/submissions/:id/publish`, `PATCH /api/managing-editor/publications/:id/schedule`, `POST /api/managing-editor/publications/:id/retract`

**UI:** Managing Editor: Publish modal (mode selector, issue assignment, DOI toggle), Published list with retract/correct actions.

**Edge cases:** `SCHEDULED` requires a background job to flip status at the scheduled time — must be idempotent if the job runs twice; `DOI_PENDING` publications are publicly visible but flagged "DOI pending" until Section H's DOI workflow resolves.

---

### 11. Direct Admin Publication (single + bulk)

**Schema:** reuses `Publication` + `Submission` with `Submission.source: ORGANIC | ADMIN_DIRECT | BULK_IMPORT`.

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/managing-editor/publish-direct` | Single manual publish (skips review pipeline) |
| POST | `/api/managing-editor/bulk-import` | CSV/Excel upload |
| GET | `/api/managing-editor/bulk-import/:jobId/status` | Import job progress |
| GET | `/api/managing-editor/bulk-import/:jobId/errors` | Row-level error report |

**UI:** Managing Editor: Direct Publish form; Bulk Import page (file upload, column-mapping step, dry-run preview, commit, error report download).

**Edge cases:** bulk import must validate every row before committing any (or run per-row transactions with a failure report — pick one and be consistent); duplicate detection against existing `Submission.title + authorId` to avoid double-importing the same paper.

---

### 12. Roles — Single Account, Multiple Roles, One Dashboard

Already defined (Member/Author/Reviewer). Dashboard renders role-specific sections conditionally based on `UserRole[]` join table. See Section J for the role-switcher UI addition.

**Schema:**
```prisma
model UserRole {
  id     String @id @default(cuid())
  userId String
  role   GlobalRole   // MEMBER AUTHOR REVIEWER — editorial roles are journal-scoped, see Section C
  @@unique([userId, role])
}
```

---

### 13. Permission Matrix

Already defined per the original 3 roles (Member/Author/Reviewer). **Extended** in Section C below to cover the 4 editorial tiers. Final canonical matrix lives in Section C's table — do not maintain two separate matrices.

---

## PART 2 — MISSING MODULES (new, full detail)

### A. Journal / Volume / Issue Management

**State diagram (Issue):**
```
DRAFT → IN_PROGRESS → READY_TO_PUBLISH → PUBLISHED
```
- `DRAFT`: issue shell created, no papers assigned yet
- `IN_PROGRESS`: ≥1 paper assigned, ToC incomplete or papers still pending
- `READY_TO_PUBLISH`: all assigned papers are `ACCEPTED`+certified, ToC finalized, Managing Editor locks it
- `PUBLISHED`: live (triggers Section 10's Publication flow for every paper in the issue)

**Schema:**
```prisma
model Journal {
  id             String   @id @default(cuid())
  name           String
  issn           String?  @unique
  scope          String
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
}
model EditorialBoardMember {
  id        String @id @default(cuid())
  journalId String
  userId    String
  title     String   // "Editor-in-Chief", "Section Editor — Biology", etc.
}
model Volume {
  id        String @id @default(cuid())
  journalId String
  year      Int
  volumeNumber Int
  @@unique([journalId, volumeNumber])
}
model Issue {
  id            String   @id @default(cuid())
  volumeId      String
  issueNumber   Int
  publishDate   DateTime?
  isSpecialIssue Boolean @default(false)
  specialTheme  String?
  status        IssueStatus @default(DRAFT)
  @@unique([volumeId, issueNumber])
}
model IssueArticle {
  id        String @id @default(cuid())
  issueId   String
  submissionId String
  sortOrder Int
  @@unique([issueId, submissionId])
}
enum IssueStatus { DRAFT IN_PROGRESS READY_TO_PUBLISH PUBLISHED }
```

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/admin/journals` | Create journal |
| PATCH | `/api/admin/journals/:id` | Update journal/board |
| POST | `/api/admin/journals/:id/volumes` | Create volume |
| POST | `/api/admin/volumes/:id/issues` | Create issue |
| POST | `/api/managing-editor/issues/:id/articles` | Assign paper(s) to issue (accepts array for bulk) |
| PATCH | `/api/managing-editor/issues/:id/reorder` | Reorder articles (array of `{submissionId, sortOrder}`) |
| GET | `/api/managing-editor/issues/:id/toc` | Auto-generated Table of Contents |
| PATCH | `/api/managing-editor/issues/:id/status` | Advance issue status |

**UI:**
- Super Admin: Journal Setup (name/ISSN/scope/board members), Journal list (multi-journal switcher in admin nav)
- Managing Editor: Volume/Issue manager — tree view (Journal → Volume → Issue), Issue detail with drag-drop article list (sortOrder), "Assign Accepted Papers" picker (filtered to `ACCEPTED`+uncertified-into-issue papers), ToC preview pane
- Author/Member: public-facing Issue/ToC view (read-only, published issues only)

**Edge cases:** a paper can only belong to one issue at a time (unique constraint); reordering must be a single atomic transaction (no partial sortOrder writes); deleting a Volume/Issue with assigned papers should be blocked, not cascade; special-issue theme field required when `isSpecialIssue=true`, enforced at API level not just UI.

---

### B. Payment Module (Membership Fee + APC)

**State diagram (shared by both payment types):**
```
INITIATED → PENDING → PROCESSING → SUCCESS
                                  → FAILED → (retry) → PENDING
INITIATED → PENDING → PROCESSING → (proof-based) SUBMITTED_FOR_VERIFICATION → VERIFIED | REJECTED
```

**APC trigger point:** fired exactly once, on `EditorialDecision.confirmedAt` transitioning to `outcome = ACCEPTED` (Section 7). Not at submission. Implemented as a domain event (`submission.accepted`) consumed by the Payment module to create the `Payment` record with `type = APC`.

**Schema:**
```prisma
model Payment {
  id            String   @id @default(cuid())
  userId        String
  type          PaymentType   // MEMBERSHIP_FEE | APC
  submissionId  String?       // set when type = APC
  amount        Decimal
  currency      String
  region        String?
  gateway       String        // "razorpay" | "stripe" | "paypal" | "proof_upload"
  gatewayRef    String?       // idempotency key / gateway transaction id
  status        PaymentStatus @default(INITIATED)
  waiverCodeId  String?
  proofUrl      String?
  verifiedById  String?
  verifiedAt    DateTime?
  failureReason String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([gatewayRef])   // idempotency
}
model WaiverCode {
  id        String @id @default(cuid())
  code      String @unique
  discountPercent Int?
  flatAmount Decimal?
  regionRestriction String?
  expiresAt DateTime?
  maxUses   Int?
  usedCount Int @default(0)
}
model Refund {
  id        String @id @default(cuid())
  paymentId String
  type      RefundType   // FULL | PARTIAL | NONE
  amount    Decimal
  reason    String
  approvedById String
  processedAt DateTime?
  gatewayRefundRef String?
}
enum PaymentType { MEMBERSHIP_FEE APC }
enum PaymentStatus { INITIATED PENDING PROCESSING SUCCESS FAILED SUBMITTED_FOR_VERIFICATION VERIFIED REJECTED REFUNDED PARTIALLY_REFUNDED }
enum RefundType { FULL PARTIAL NONE }
```

**Refund policy (default thresholds — configurable per journal):**
- `FULL`: submission rejected **before** payment reaches `PROCESSING`, or APC charged in error
- `PARTIAL` (50%): rejected after `PROCESSING` but before any production work started (e.g., before copyediting begins)
- `NONE`: after publication, or after production work has started

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/payments/initiate` | Create payment intent (membership or APC), returns gateway client token |
| POST | `/api/payments/:id/confirm` | Gateway webhook/callback — idempotent on `gatewayRef` |
| POST | `/api/payments/:id/upload-proof` | Proof-based flow |
| PATCH | `/api/admin/payments/:id/verify` | Verify/reject proof |
| POST | `/api/payments/:id/retry` | Retry failed payment (reuses same idempotency key) |
| POST | `/api/payments/waiver-codes` | Admin: create waiver code |
| POST | `/api/payments/:id/apply-waiver` | Apply code at checkout |
| POST | `/api/admin/payments/:id/refund` | Issue refund |
| GET | `/api/admin/payments/audit` | Full transaction/refund/override audit trail |
| GET | `/api/payments/:id/invoice` | Generate/download invoice PDF |

**UI:**
- Member/Author: Payment Page (amount breakdown table, currency/region selector, gateway method tabs, waiver code input, invoice preview, terms checkbox, Pay button), Payment Status screen (poll/webhook-driven), Payment History tab
- Managing Editor: Proof Verification queue, Refund issuance form (type selector pre-filled by policy thresholds, override with justification)
- Super Admin: Payment Audit Trail (all transactions, filters by journal/user/status/date, manual override log)

**Edge cases:** webhook may arrive twice — `gatewayRef` unique constraint + upsert logic prevents double-`SUCCESS`; retry must reuse the original idempotency key, never generate a new charge attempt without invalidating the old `PENDING`; waiver code race condition on `maxUses` — use atomic `UPDATE ... WHERE usedCount < maxUses` not read-then-write; invoice PDF generation reuses the Certificate module's PDF pipeline (Section 9) for consistent branding.

---

### C. Editorial Role Hierarchy

**Permission matrix (journal-scoped):**

| Action | Associate/Section Editor | Managing Editor | Editor-in-Chief | Super Admin |
|---|---|---|---|---|
| Screen submissions | ✅ | ✅ | ✅ | ✅ |
| Invite reviewers | ✅ | ❌ | ✅ | ✅ |
| Recommend decision | ✅ | ❌ | ✅ | ✅ |
| **Finalize accept/reject** | ❌ | ❌ | ✅ | ✅ (override) |
| Manage payments/refunds | ❌ | ✅ | ❌ | ✅ |
| Issue certificates | ❌ | ✅ | ❌ | ✅ |
| Schedule/publish issues | ❌ | ✅ | ✅ (approve) | ✅ |
| Journal-wide settings (board, scope) | ❌ | ❌ | ✅ | ✅ |
| Create new Journal entity | ❌ | ❌ | ❌ | ✅ |
| User/role management | ❌ | ❌ | ❌ | ✅ |

**Schema:**
```prisma
model JournalRole {
  id        String @id @default(cuid())
  userId    String
  journalId String
  role      EditorialRole
  @@unique([userId, journalId, role])
}
enum EditorialRole { ASSOCIATE_EDITOR MANAGING_EDITOR EDITOR_IN_CHIEF }
```

**API:** `POST /api/admin/journals/:id/editorial-roles`, `DELETE /api/admin/journals/:id/editorial-roles/:roleId`, `GET /api/me/editorial-roles` (drives nav/permission gating client-side, enforced server-side via middleware on every route above).

**UI:** Super Admin: Editorial Board Manager per journal (assign user → role, table view). Editor dashboards conditionally render sections per the matrix (middleware-enforced, not just hidden in UI).

**Edge cases:** Editor-in-Chief override of their own Associate Editor's recommendation must be logged distinctly (audit trail, Section K); a user with no `JournalRole` on a given journal but with `Super Admin` global role bypasses the matrix entirely — implement as `role check OR isSuperAdmin`, not a duplicated row per journal.

---

### D. Reviewer Matching & Workload

**Schema:**
```prisma
model ReviewerExpertise {
  id          String @id @default(cuid())
  reviewerId  String
  subjectArea String
  keyword     String
}
model ReviewerWorkload {
  reviewerId       String @id
  concurrentCap    Int    @default(3)
  currentActiveCount Int  @default(0)
  lastAssignedAt   DateTime?
}
model ConflictOfInterest {
  id           String @id @default(cuid())
  reviewerId   String
  submissionId String
  reason       COIReason   // SAME_INSTITUTION | RECENT_COAUTHOR | IS_AUTHOR | DECLARED
  detectedAt   DateTime @default(now())
  @@unique([reviewerId, submissionId])
}
enum COIReason { SAME_INSTITUTION RECENT_COAUTHOR IS_AUTHOR DECLARED }
```

**Matching logic (server-side, runs before showing candidates to editor):**
1. Pull reviewers where `ReviewerExpertise.subjectArea` or `.keyword` overlaps submission's tags
2. Exclude any reviewer with a `ConflictOfInterest` row for this submission
3. Auto-detect COI at invite-candidate-generation time: same `institution` as any author, OR co-authorship with any author within last N years (cross-ref ORCID publication history if linked), OR reviewer is listed as an author/co-author
4. Exclude reviewers at `currentActiveCount >= concurrentCap`
5. Sort remaining candidates by `lastAssignedAt ASC` (least-recently-assigned first)

**API:**
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/editor/submissions/:id/reviewer-candidates?subjectArea=&keyword=` | Filtered, COI-excluded, workload-sorted candidate list |
| PATCH | `/api/reviewer/expertise` | Reviewer self-manages subject tags/keywords |
| POST | `/api/reviewer/orcid-link` | Link ORCID for auto-pulled publication history |
| PATCH | `/api/admin/reviewers/:id/workload-cap` | Admin override of concurrent cap |

**UI:** Associate Editor: Reviewer Finder (search/filter by subject area, candidate cards showing expertise tags, current load `2/3`, last-assigned date, COI-excluded reviewers hidden by default with a "show excluded (debug)" toggle for transparency). Reviewer: Expertise/Keywords settings page, ORCID link button.

**Edge cases:** COI auto-detection is advisory, not a hard block — editor can override with a logged justification (some small fields have unavoidable overlap); `currentActiveCount` must increment/decrement transactionally with `ReviewInvitation`/`Review` status changes to avoid drift — prefer a derived count (query `COUNT(*) WHERE status IN (ACCEPTED) AND review not yet submitted`) over a manually maintained counter if consistency is a concern.

---

### E. Plagiarism / Similarity Check Integration

**State diagram:**
```
SCREENING → SIMILARITY_CHECK_QUEUED → SIMILARITY_CHECK_COMPLETE → (score > threshold) → ETHICS_REVIEW
                                                                  → (score ≤ threshold) → continues screening normally
```

**Schema:**
```prisma
model SimilarityCheck {
  id            String   @id @default(cuid())
  submissionId  String   @unique
  provider      String   // "turnitin" | "ithenticate" | "manual"
  similarityScore Float?
  reportUrl     String?
  status        SimilarityCheckStatus @default(QUEUED)
  thresholdAtCheck Float  @default(25.0)
  flaggedForEthics Boolean @default(false)
  checkedAt     DateTime?
}
enum SimilarityCheckStatus { QUEUED RUNNING COMPLETE FAILED MANUAL_PENDING }
```

**Integration:** wrap behind an interface (`SimilarityProvider`) with `turnitin`/`ithenticate` adapters; ship a `manual` adapter as the interim placeholder (editor uploads a score + report PDF by hand) so the workflow is fully functional before a vendor contract is signed.

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/system/submissions/:id/similarity-check` | Trigger check (auto-fired on `SCREENING` entry) |
| GET | `/api/editor/submissions/:id/similarity-report` | Fetch score/report |
| PATCH | `/api/editor/submissions/:id/similarity-check/manual` | Manual interim entry |
| PATCH | `/api/admin/similarity-threshold` | Configure threshold (global or per-journal) |

**UI:** Associate Editor: Similarity Score badge on screening queue row (color-coded by threshold), Report viewer (embedded PDF/iframe), Manual Entry form (interim mode). Super Admin: Threshold configuration per journal.

**Edge cases:** provider API failure should set `FAILED` and surface a manual-override path, not block screening indefinitely; threshold breach auto-sets `ScreeningOutcome = PLAGIARISM_CONCERN` candidate but editor must still confirm (not fully automatic reject) to avoid false positives on quotes/references blowing up the score.

---

### F. Co-Author Management

**State diagram (per co-author invite):**
```
INVITED → CONSENTED | DECLINED | EXPIRED
```
Submission cannot move from `DRAFT → SUBMITTED` (Section 2) while any co-author invite is still `INVITED` or `DECLINED` (declined co-authors must be removed or resolved first).

**Schema:**
```prisma
model CoAuthor {
  id           String @id @default(cuid())
  submissionId String
  userId       String?     // null if invited by email, not yet a platform user
  email        String
  isCorresponding Boolean  @default(false)
  consentStatus CoAuthorConsent @default(INVITED)
  consentedAt  DateTime?
  invitedAt    DateTime @default(now())
  @@unique([submissionId, email])
}
enum CoAuthorConsent { INVITED CONSENTED DECLINED EXPIRED }
```

One `CoAuthor` row per submission must have `isCorresponding = true`, enforced at the application layer (Prisma doesn't support partial unique indexes portably across all targets — enforce in service code + a DB check constraint if on Postgres).

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/author/submissions/:id/co-authors` | Invite co-author |
| POST | `/api/co-authors/:id/respond` | Consent/decline (token-based link if not yet a user) |
| PATCH | `/api/author/submissions/:id/co-authors/:coAuthorId/set-corresponding` | Reassign corresponding author |
| GET | `/api/co-authors/me/submissions` | Co-author's read-only view of submissions they're listed on |

**UI:** Author: Co-Author panel in submission wizard (add by email, corresponding-author radio, consent status per row). Co-Author (read-only role): notification + read-only submission view (status timeline, no edit/withdraw controls — UI must hard-disable these, and API must reject writes from non-author/non-corresponding users regardless of UI state).

**Edge cases:** all status notifications (Section 8's "Notifications" cross-cutting concern) route to the **corresponding author only**, not all co-authors, unless a co-author explicitly opts into CCs; submission blocked from `SUBMITTED` if any required co-author consent is outstanding — surface this as a blocking checklist item, not a silent failure.

---

### G. Copyright & Licensing

**State diagram:**
```
EditorialDecision.ACCEPTED → LICENSE_PENDING → LICENSE_SELECTED → (gates) → eligible for Publication (Section 10)
```

**Schema:**
```prisma
model LicenseAgreement {
  id           String @id @default(cuid())
  submissionId String @unique
  type         LicenseType
  ccVariant    String?    // "CC-BY-4.0", "CC-BY-NC-4.0", etc., set if type = CREATIVE_COMMONS
  signedById   String
  signedAt     DateTime?
  documentUrl  String?    // generated copyright transfer PDF, if COPYRIGHT_TRANSFER
}
enum LicenseType { COPYRIGHT_TRANSFER CREATIVE_COMMONS }
```

**API:** `GET /api/author/submissions/:id/license-options` (journal-configured allowed license types), `POST /api/author/submissions/:id/license` (select + sign)

**UI:** Author: License Selection step (auto-prompted immediately after `ACCEPTED` notification, before any publication scheduling can proceed) — radio choice between Copyright Transfer (e-sign, generates PDF) and Creative Commons (variant dropdown).

**Edge cases:** Publication workflow (Section 10) must hard-block `READY_TO_PUBLISH` if `LicenseAgreement` is missing or unsigned for any paper in the issue — validate at the issue-lock step, not just at individual-paper level, so a forgotten license doesn't slip through inside a bulk issue.

---

### H. Post-Publication

**H.1 Errata/Correction:**
```
REQUESTED (author or admin initiated) → UNDER_REVIEW → APPROVED → LIVE
                                                       → REJECTED
```

**H.2 DOI:**
```
NOT_REQUESTED → REQUESTED → REGISTERED | FAILED (retry → REQUESTED)
```
(states already on `Publication.doiStatus`, Section 10 — this section details the workflow around it)

**H.3 Indexing tracking:** per-index status field, no state machine (independent trackers).

**Schema:**
```prisma
model CorrectionRequest {
  id            String @id @default(cuid())
  publicationId String
  initiatedById String
  initiatorRole CorrectionInitiator   // AUTHOR | ADMIN
  description   String
  status        CorrectionStatus @default(REQUESTED)
  reviewedById  String?
  reviewNotes   String?
  liveAt        DateTime?
}
enum CorrectionInitiator { AUTHOR ADMIN }
enum CorrectionStatus { REQUESTED UNDER_REVIEW APPROVED REJECTED LIVE }

model DoiRegistration {
  id            String @id @default(cuid())
  publicationId String @unique
  crossrefSubmissionId String?
  status        DoiStatus @default(NOT_REQUESTED)   // reuse enum from Section 10
  lastAttemptAt DateTime?
  failureReason String?
}

model IndexingStatus {
  id            String @id @default(cuid())
  publicationId String
  index         IndexName   // SCOPUS | DOAJ | GOOGLE_SCHOLAR
  status        IndexingState @default(NOT_SUBMITTED)
  submittedAt   DateTime?
  notes         String?
  @@unique([publicationId, index])
}
enum IndexName { SCOPUS DOAJ GOOGLE_SCHOLAR }
enum IndexingState { NOT_SUBMITTED SUBMITTED INDEXED REJECTED }
```

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/publications/:id/correction-requests` | Author or admin initiates |
| PATCH | `/api/managing-editor/correction-requests/:id/review` | Approve/reject |
| PATCH | `/api/managing-editor/correction-requests/:id/publish` | Push approved correction live |
| POST | `/api/managing-editor/publications/:id/doi/register` | Submit to CrossRef API (or manual entry) |
| GET | `/api/managing-editor/publications/:id/doi/status` | Poll status |
| PATCH | `/api/managing-editor/publications/:id/indexing/:index` | Update per-index status |

**UI:** Author: "Request Correction" button on own published papers (description field, submits). Managing Editor: Correction Review queue, DOI dashboard (per-publication register/retry button + status), Indexing tracker grid (publication × index matrix, status dropdown per cell).

**Edge cases:** a `LIVE` correction must version the original publication record (keep original + correction notice both visible, never silently overwrite the published PDF/metadata) — append, don't mutate; DOI registration retry must not re-submit to CrossRef if already `REGISTERED` (idempotent check before calling out).

---

### I. SLA / Timeout Handling

Applies uniformly to every "return to author/reviewer" loop: editorial screening corrections (Section 2), reviewer invitation response (Section 3), review submission (Section 5), author revision (Section 8).

**Default SLA days (configurable per journal, these are defaults):**
| Stage | SLA (days) |
|---|---|
| Formatting correction / missing docs / minor edits response | 14 |
| Reviewer invitation response | 5 |
| Review submission | 21 |
| Minor revision | 14 |
| Major revision / Revise & resubmit | 30 |

**Reminder schedule:** auto-reminder at 50%, 80%, 100% of SLA window. At 100% (breach), trigger escalation.

**Schema:**
```prisma
model SlaClock {
  id          String   @id @default(cuid())
  entityType  String   // "Submission" | "ReviewInvitation" | "Review"
  entityId    String
  stage       String   // e.g. "FORMATTING_CORRECTION", "REVIEWER_RESPONSE"
  startedAt   DateTime @default(now())
  dueAt       DateTime
  reminderSentAt50 DateTime?
  reminderSentAt80 DateTime?
  breachedAt  DateTime?
  resolvedAt  DateTime?
  escalationAction String?  // "NOTIFIED_ADMIN" | "AUTO_WITHDRAWN" | "AUTO_CLOSED"
}
model SlaConfig {
  id         String @id @default(cuid())
  journalId  String?   // null = platform default
  stage      String
  days       Int
  @@unique([journalId, stage])
}
```

**API:** `GET /api/admin/sla-configs`, `PATCH /api/admin/sla-configs/:stage`, `GET /api/admin/sla-breaches` (dashboard feed), internal cron: `runs every hour, checks SlaClock.dueAt against now()`.

**UI:** Super Admin: SLA Configuration page (per-journal override table). Editors: SLA badge on every queue row showing days-remaining/overdue, color-coded (green/amber/red). Super Admin: Breach Dashboard (all currently-breached clocks, filter by stage/journal, manual escalate/extend actions).

**Edge cases:** extension requests (Section 5's `REQUEST_EXTENSION`) must update `dueAt` and reset reminder flags, not create a parallel clock; escalation action is configurable per stage — reviewer no-response should probably auto-revoke the invitation (not withdraw the whole submission), while author non-response on revision deadline might auto-close the submission — define per-stage default escalation action in `SlaConfig`, don't hardcode one behavior for all stages.

---

### J. Account & Security

**Schema:**
```prisma
model EmailVerification {
  id        String @id @default(cuid())
  userId    String @unique
  token     String @unique
  verifiedAt DateTime?
  expiresAt DateTime
}
model PasswordReset {
  id        String @id @default(cuid())
  userId    String
  token     String @unique
  usedAt    DateTime?
  expiresAt DateTime
}
model TwoFactorAuth {
  userId    String @id
  enabled   Boolean @default(false)
  secret    String?
  backupCodes String[]
}
```

**Duplicate account detection:** unique constraint on `User.email`; secondary soft-check on `User.orcid` (warn, don't hard-block, since some legit cases share institutional patterns — surface a "possible duplicate" flag to Super Admin rather than auto-rejecting registration).

**API:**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Triggers `EmailVerification` |
| GET | `/api/auth/verify-email?token=` | Confirm |
| POST | `/api/auth/forgot-password` | Triggers `PasswordReset` |
| POST | `/api/auth/reset-password` | Consume token, set new password |
| POST | `/api/auth/2fa/enable` | Returns QR/secret |
| POST | `/api/auth/2fa/verify` | Confirm TOTP code, activates |
| POST | `/api/auth/2fa/challenge` | Login-time 2FA check |
| GET | `/api/admin/duplicate-accounts` | Flagged possible duplicates |

**UI:**
- All roles: "Verify your email" interstitial (resend button), Forgot/Reset Password flow, 2FA Setup page (QR code, backup codes display-once), 2FA challenge screen at login (if enabled)
- All roles: **Role Switcher** — dropdown/tab in dashboard header showing only roles the account actually holds (Member/Author/Reviewer; editorial roles shown per-journal if any), switching changes which dashboard sections render — this is a client-side view filter, not a re-login
- Super Admin: Duplicate Account Review queue

**Edge cases:** unverified email should still allow login but gate sensitive actions (submitting papers, payments) behind a "please verify" block — don't lock the whole account, matches existing membership-gating precedent from Section 1; password reset tokens single-use and short-lived (≤1hr); 2FA backup codes shown exactly once at generation, regenerable on demand (invalidates old set).

---

### K. Compliance

**Schema:**
```prisma
model AuditLog {
  id          String   @id @default(cuid())
  actorId     String
  action      String        // "submission.screened", "payment.refunded", "decision.confirmed", etc.
  entityType  String
  entityId    String
  beforeState Json?
  afterState  Json?
  ipAddress   String?
  createdAt   DateTime @default(now())
}
model DataExportRequest {
  id        String @id @default(cuid())
  userId    String
  status    ExportStatus @default(REQUESTED)
  exportUrl String?
  requestedAt DateTime @default(now())
  completedAt DateTime?
}
model AccountDeletionRequest {
  id        String @id @default(cuid())
  userId    String
  status    DeletionStatus @default(REQUESTED)
  reason    String?
  scheduledFor DateTime?     // grace period before hard delete
  completedAt  DateTime?
}
enum ExportStatus { REQUESTED PROCESSING READY FAILED }
enum DeletionStatus { REQUESTED SCHEDULED CANCELLED COMPLETED }
```

**API:**
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/audit-log?entityType=&actorId=&from=&to=` | Searchable audit trail |
| POST | `/api/me/data-export` | Self-service GDPR export request |
| GET | `/api/me/data-export/:id` | Download when ready |
| POST | `/api/me/account-deletion` | Request deletion (grace period configurable, e.g. 30 days) |
| PATCH | `/api/me/account-deletion/:id/cancel` | Cancel during grace period |

**UI:** Super Admin: Audit Log viewer (filterable table, before/after JSON diff view per entry). Member/Author/Reviewer: Privacy/Data tab (Request Export, Request Deletion with grace-period warning + cancel option).

**Edge cases:** every state-changing endpoint across **every module above** should write an `AuditLog` row — implement as middleware/interceptor at the service layer, not ad-hoc per-controller, or coverage will be inconsistent; account deletion must check for legal/record-keeping holds (e.g., an Editor-in-Chief with active editorial decisions on record cannot be hard-deleted — anonymize instead of delete, keep the decision record's integrity intact) — define an `anonymize` path distinct from `hard delete` for users with non-erasable system records.

---

### L. Paper Review Queue (Super Admin assignment screen)

This is the actual operational screen that replaces the old "direct-assign a Reviewer" idea. **A paper is never assigned to a person directly — it is always assigned to a Workflow.** If the use case is "this one paper just needs one specific reviewer," the answer is a single-stage Workflow with that reviewer as the only stage, not a separate assignment mechanism. One path, no branching, no confusion about which mechanism is "active" for a given paper.

**State diagram:**
```
SCREENED (MOVE_TO_REVIEW outcome, Section 2) → UNASSIGNED → WORKFLOW_ASSIGNED → IN_PROGRESS (stage transitions owned by the Workflow engine, Section 3/5/6) → WORKFLOW_COMPLETE
```
- `UNASSIGNED`: paper has passed screening and is sitting in the Paper Queue, visible to Super Admin, no workflow attached yet
- `WORKFLOW_ASSIGNED`: Super Admin has picked a `WorkflowTemplate` (or Sub-Admin-only / single-reviewer-only workflow) and attached it; the workflow's stage-1 assignee (could be a Reviewer role or a Sub Admin role — a `WorkflowStage` is just "who acts at this step," not specifically "a Reviewer") is notified automatically
- `IN_PROGRESS`: normal stage-by-stage progression as already defined in Sections 3/5/6 — nothing new here, this section only owns the queue + the initial assignment action
- `WORKFLOW_COMPLETE`: last stage resolved, submission falls through to Editorial Decision (Section 7)

**Schema:** no new core entity — this section is a **UI/API layer over the existing `Submission` + `Workflow`/`WorkflowStage` models** (Sections 2, 3). The only addition is a denormalized queue-state field for fast filtering:
```prisma
model Submission {
  // ...existing fields from Section 2...
  queueStatus String @default("UNASSIGNED")   // "UNASSIGNED" | "WORKFLOW_ASSIGNED" | "IN_PROGRESS" | "WORKFLOW_COMPLETE"
  workflowId  String?
  workflowAssignedAt DateTime?
  workflowAssignedById String?
}
```
`WorkflowStage` (Section 3's model) already supports "who acts at this step" generically — a stage's assignee can resolve to either a Reviewer-role user or a Sub-Admin-role user; the engine doesn't care which, it just needs *a* user (or user-pool) per stage. This is what makes "assign to a Sub Admin" and "assign to a Reviewer" the same mechanism instead of two — both are just different `WorkflowStage.assigneeRole` values inside the same `Workflow`.

**API:**
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/paper-queue?status=UNASSIGNED` | List screened papers awaiting workflow assignment |
| GET | `/api/admin/paper-queue/:id` | Paper detail (metadata, screening outcome, similarity score if run) |
| GET | `/api/admin/workflow-templates` | Templates available to assign (existing Section 3 endpoint, reused here) |
| POST | `/api/admin/paper-queue/:id/assign-workflow` | Body: `{ workflowTemplateId }` — attaches workflow, sets `queueStatus = WORKFLOW_ASSIGNED`, fires stage-1 notification |
| GET | `/api/admin/paper-queue/:id/progress` | Current stage, who it's with, time-in-stage (reuses SLA clock display, Section I) |

Note there is intentionally **no** `POST /api/admin/paper-queue/:id/assign-reviewer` endpoint — that path does not exist. If a single-reviewer assignment is needed, the admin assigns a single-stage workflow template (create one ad hoc if none exists yet, reusing Section 3's "Create Workflow" UI inline).

**UI:**
- Super Admin: **Paper Review Queue** — new sidebar item, table of `UNASSIGNED` papers (title, author, screening outcome, days-waiting), row action "Assign Workflow" opens a picker (search/select existing `WorkflowTemplate`, or "+ New single-stage workflow" inline shortcut that creates a one-stage template naming a specific Reviewer or Sub Admin on the spot, then immediately assigns it — same underlying call, no separate code path)
- Super Admin: **Queue Detail** drawer — shows current stage, assignee, SLA badge, full screening history; "Reassign Workflow" action available if the assigned workflow needs to change before stage 1 is accepted
- Reviewer / Sub Admin: their existing dashboards (Sections 3/5) already surface "papers assigned to me via my current workflow stage" — no new UI needed on their side, this section is Super-Admin-facing only

**Edge cases:** assigning a workflow to a paper that already has one attached should require an explicit "Reassign" confirmation (don't silently overwrite — log the change in `AuditLog`, Section K, since it affects who has visibility into the paper); a `WorkflowTemplate` with zero stages cannot be assigned — validate at assign-time, not just at template-creation time, in case a template was edited down to zero stages after creation; if every stage in a workflow resolves to the same single person (the "just assign to one reviewer" case), the queue UI should still show normal stage progression, not a special-cased "direct" view — keeping the UI uniform is what prevents the original confusion from creeping back in.

---

## PART 3 — BUILD ORDER

Assumes a small team building incrementally on the existing codebase (Sections 1–13 already partially built; A–K net new).

### Phase 1 — Core Foundations (membership + submission + payment skeleton)
- Formalize/finish Section 1 (Membership) and Section 2 (Submission + Screening) on current schema
- Section J (Account & Security): email verification, password reset — these gate everything downstream, build first
- Section B (Payment Module): membership-fee path only in this phase; defer APC trigger until Phase 3 has an `ACCEPTED` decision to hook into
- Section K (Compliance): stand up `AuditLog` middleware now, before more write-paths exist to retrofit

### Phase 2 — Review Cycle
- Section 3 (Reviewer Invitation), Section 4 (Reviewer Approval), Section 5 (Review Submission), Section 6 (Quality Check)
- Section D (Reviewer Matching & Workload) — needed as soon as invitations exist, don't bolt on later
- Section E (Plagiarism/Similarity) — wire the `manual` adapter first; real vendor integration can land any time after
- Section I (SLA/Timeout) — implement the generic `SlaClock` engine now, attach it to reviewer-invitation and review-submission stages first (the other stages reuse the same engine in later phases)
- Section F (Co-Author Management) — needed before submissions can legally close out review (consent gate)

### Phase 3 — Editorial Decision + Revision
- Section 7 (Editorial Decision, with Editor-in-Chief confirmation gate)
- Section C (Editorial Role Hierarchy) — must land alongside Section 7, since the confirm/recommend split *is* the role hierarchy in action
- Section 8 (Author Revision) — reuses Section I's SLA engine
- Section B (Payment Module) — now add the APC path, hooked to `EditorialDecision.confirmedAt`
- Section G (Copyright & Licensing) — gates the next phase

### Phase 4 — Publication + Journal/Issue Management
- Section A (Journal/Volume/Issue Management) — build before Section 10/11, since publication needs an issue to publish into
- Section 9 (Certificate Generation) — needed before/alongside publication (acceptance certs fire earlier, publication certs fire here)
- Section 10 (Publication Workflow), Section 11 (Direct Admin Publication + bulk import)

### Phase 5 — Post-Publication + Remaining Compliance
- Section H (Errata/Correction, DOI registration, Indexing tracking)
- Section K (Compliance) — finish data export/deletion flows (audit logging already live since Phase 1)
- Section J (Account & Security) — add 2FA and role-switcher UI polish (core auth already live since Phase 1)

**Cross-cutting, build once and reuse everywhere (don't re-derive per phase):**
- `SlaClock` engine (Section I) — generic by `entityType`/`stage`, attach to new stages as phases land
- `AuditLog` middleware (Section K) — wrap every mutating service call from Phase 1 onward
- Notification dispatch (existing Section 8 cross-cutting concern from `journal-workflow-spec.md`) — extend its `type` enum as each phase introduces new triggerable events, don't build a parallel notification system per module
- Certificate/Invoice PDF pipeline (Section 9) — Payment module's invoices (Section B) and Compliance's data exports (Section K) both reuse this generator rather than maintaining separate PDF code paths

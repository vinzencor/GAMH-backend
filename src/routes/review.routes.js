import { Router } from "express";
import {
  getMyReviews,
  acceptReview,
  declineReview,
  submitReview,
  assignReviewer,
  assignReviewerBucket,
  selectReviewPaper,
  listReviews,
  recordDecision,
} from "../controllers/review.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";

const router = Router();

// Reviewer routes
router.get(
  "/my-reviews",
  protect,
  requireRoles("reviewer", "sub_admin", "super_admin", "editor"),
  getMyReviews
);
router.patch(
  "/:id/accept",
  protect,
  requireRoles("reviewer", "sub_admin", "super_admin", "editor"),
  acceptReview
);
router.patch(
  "/:id/select-paper",
  protect,
  requireRoles("reviewer", "sub_admin", "super_admin", "editor"),
  selectReviewPaper
);
router.patch(
  "/:id/decline",
  protect,
  requireRoles("reviewer", "sub_admin", "super_admin", "editor"),
  declineReview
);
router.patch(
  "/:id/submit",
  protect,
  requireRoles("reviewer", "sub_admin", "super_admin", "editor"),
  submitReview
);

// Admin routes
router.get(
  "/",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  listReviews
);
// Papers (JournalSubmissions) can no longer be assigned to a reviewer
// directly — only to a Workflow (see journal.controller.js updateJournal,
// field "workflowTemplate"). assignReviewer now rejects JournalSubmission
// targets; assignReviewerBucket is fully disabled (it only ever targeted
// JournalSubmissions). Both stubs are kept so old clients get a clear error
// instead of a 404.
router.post(
  "/assign",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  assignReviewer
);
router.post(
  "/assign-bucket",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  assignReviewerBucket
);
router.post(
  "/decision",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  recordDecision
);

export default router;

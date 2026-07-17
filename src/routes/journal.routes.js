import { Router } from "express";
import {
  createJournalDraft,
  submitJournal,
  listMyJournals,
  updateJournal,
  submitDraftJournal,
  listPublishedJournals,
  getFeaturedJournals,
  getJournalBySlug,
  listAllJournals,
  deleteJournal,
  adminUploadJournal,
  withdrawJournal,
  verifyJournalPayment,
  trackJournal,
} from "../controllers/journal.controller.js";
import { protect, optionalAuth } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";
import { upload, uploadToS3, setUploadFolderByField } from "../utils/upload.js";

const router = Router();

const journalUpload = upload.fields([
  { name: "manuscript", maxCount: 1 },
  { name: "supplementary", maxCount: 1 },
  { name: "coverImage", maxCount: 1 },
  { name: "paymentProof", maxCount: 1 },
]);

// Public
router.get("/featured", optionalAuth, getFeaturedJournals);
router.get("/published", optionalAuth, listPublishedJournals);
router.get("/slug/:slug", optionalAuth, getJournalBySlug);
router.post("/:id/track", optionalAuth, trackJournal);

// Author
router.get("/my-submissions", protect, listMyJournals);
router.post(
  "/",
  protect,
  setUploadFolderByField({ manuscript: "journals", supplementary: "documents", coverImage: "images", paymentProof: "documents" }),
  journalUpload,
  uploadToS3,
  createJournalDraft
);
router.post(
  "/submit",
  protect,
  setUploadFolderByField({ manuscript: "journals", supplementary: "documents", coverImage: "images", paymentProof: "documents" }),
  journalUpload,
  uploadToS3,
  submitJournal
);
router.patch(
  "/:id",
  protect,
  setUploadFolderByField({ manuscript: "journals", supplementary: "documents", coverImage: "images", paymentProof: "documents" }),
  journalUpload,
  uploadToS3,
  updateJournal
);
router.patch(
  "/:id/submit",
  protect,
  setUploadFolderByField({ manuscript: "journals", supplementary: "documents", coverImage: "images", paymentProof: "documents" }),
  journalUpload,
  uploadToS3,
  submitDraftJournal
);
router.patch("/:id/withdraw", protect, withdrawJournal);
router.patch(
  "/:id/verify-payment",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  verifyJournalPayment
);

// Admin
router.get(
  "/admin/all",
  protect,
  requireRoles("super_admin", "content_admin", "editor", "sub_admin"),
  listAllJournals
);
router.post(
  "/admin/upload",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  setUploadFolderByField({ manuscript: "journals", supplementary: "documents", coverImage: "images", paymentProof: "documents" }),
  journalUpload,
  uploadToS3,
  adminUploadJournal
);
router.delete(
  "/:id",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  deleteJournal
);

export default router;
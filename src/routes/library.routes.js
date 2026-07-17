import { Router } from "express";
import {
  listLibrary,
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
  saveItem,
  unsaveItem,
  getMySavedItems,
  getMyLibrarySubmissions,
  createLibraryDraft,
  submitLibraryItem,
  submitLibraryDraft,
  reviewLibrarySubmission,
  listAllLibraryItems,
  trackLibraryItem,
} from "../controllers/library.controller.js";
import { protect, optionalAuth } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";
import { upload, uploadToS3, setUploadFolder } from "../utils/upload.js";

const router = Router();

// Public/member listing
router.get("/", optionalAuth, listLibrary);
router.post("/:id/track", optionalAuth, trackLibraryItem);

// User saved items
router.get("/saved", protect, getMySavedItems);
router.post("/save/:itemId", protect, saveItem);
router.delete("/save/:itemId", protect, unsaveItem);

// User library submissions
router.get("/my-submissions", protect, getMyLibrarySubmissions);
router.post(
  "/draft",
  protect,
  setUploadFolder("papers"),
  upload.single("pdf"),
  uploadToS3,
  createLibraryDraft
);
router.post(
  "/submit",
  protect,
  setUploadFolder("papers"),
  upload.single("pdf"),
  uploadToS3,
  submitLibraryItem
);

// Admin CRUD
router.get(
  "/admin/all",
  protect,
  requireRoles("super_admin", "content_admin", "editor", "sub_admin"),
  listAllLibraryItems
);
router.patch(
  "/admin/:id/review",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  reviewLibrarySubmission
);
router.post(
  "/",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  setUploadFolder("papers"),
  upload.single("pdf"),
  uploadToS3,
  createLibraryItem
);
router.patch(
  "/:id/submit",
  protect,
  setUploadFolder("papers"),
  upload.single("pdf"),
  uploadToS3,
  submitLibraryDraft
);
router.patch(
  "/:id",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  setUploadFolder("papers"),
  upload.single("pdf"),
  uploadToS3,
  updateLibraryItem
);
router.delete(
  "/:id",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  deleteLibraryItem
);

export default router;

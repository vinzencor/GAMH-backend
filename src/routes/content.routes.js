import { Router } from "express";
import {
  listPublished,
  getBySlug,
  getMySubmissions,
  createContent,
  submitPaper,
  updateContent,
  listAllContent,
  deleteContent,
  getHomepageContent,
  trackContent,
} from "../controllers/content.controller.js";
import { protect, optionalAuth } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";

const router = Router();

// Public
router.get("/published", optionalAuth, listPublished);
router.get("/homepage", getHomepageContent);
router.get("/slug/:slug", optionalAuth, getBySlug);
router.post("/:id/track", optionalAuth, trackContent);

// Author
router.get("/my-submissions", protect, getMySubmissions);
router.post("/", protect, createContent);
router.patch("/:id/submit", protect, submitPaper);
router.patch("/:id", protect, updateContent);

// Admin
router.get(
  "/admin/all",
  protect,
  requireRoles("super_admin", "content_admin", "editor", "sub_admin"),
  listAllContent
);
router.delete(
  "/:id",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  deleteContent
);

export default router;

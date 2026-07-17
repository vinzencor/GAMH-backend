import { Router } from "express";
import {
  listNotifications,
  markRead,
  markAllRead,
  listMyNotifications,
  markMyRead,
  markAllMyRead,
} from "../controllers/notification.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";

const router = Router();

// Author/user-facing — any authenticated user, scoped to their own notifications
router.get("/my", protect, listMyNotifications);
router.patch("/my/:id/read", protect, markMyRead);
router.patch("/my/mark-all-read", protect, markAllMyRead);

// Admin-facing — super_admin/content_admin/editor only
router.get("/", protect, requireRoles("super_admin", "content_admin", "editor"), listNotifications);
router.patch("/:id/read", protect, requireRoles("super_admin", "content_admin", "editor"), markRead);
router.patch("/mark-all-read", protect, requireRoles("super_admin", "content_admin", "editor"), markAllRead);

export default router;

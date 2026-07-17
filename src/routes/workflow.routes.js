import { Router } from "express";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getStages,
  upsertStages,
  getMyQueue,
  reviewAction,
  getContentLogs,
  getMyLogs,
  getAllLogs,
  getMyScore,
} from "../controllers/workflow.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";

const router = Router();

// Templates – admin only
router.get(
  "/templates",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  listTemplates
);
router.post(
  "/templates",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  createTemplate
);
router.patch(
  "/templates/:id",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  updateTemplate
);
router.delete(
  "/templates/:id",
  protect,
  requireRoles("super_admin"),
  deleteTemplate
);

// Stages
router.get("/templates/:templateId/stages", protect, getStages);
router.put(
  "/templates/:templateId/stages",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  upsertStages
);

// Sub-admin review queue
router.get(
  "/my-queue",
  protect,
  requireRoles("sub_admin", "reviewer", "super_admin", "editor"),
  getMyQueue
);
router.post(
  "/content/:contentId/action",
  protect,
  requireRoles("sub_admin", "reviewer", "super_admin", "editor", "content_admin"),
  reviewAction
);

// Logs
router.get("/content/:contentId/logs", protect, getContentLogs);
router.get(
  "/my-logs",
  protect,
  requireRoles("sub_admin", "reviewer", "super_admin", "editor"),
  getMyLogs
);
router.get(
  "/all-logs",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  getAllLogs
);

// Gamification
router.get("/my-score", protect, requireRoles("sub_admin", "reviewer", "super_admin"), getMyScore);

export default router;

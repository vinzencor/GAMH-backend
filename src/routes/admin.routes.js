import { Router } from "express";
import {
  getAnalytics,
  getPipeline,
  getSubAdminLeaderboard,
  getSubAdminUsers,
} from "../controllers/admin.controller.js";
import {
  listSupportRequests,
  reviewSupportRequest,
} from "../controllers/support.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";

const ADMIN_ROLES = ["super_admin", "content_admin", "editor"];

const router = Router();

router.get("/analytics", protect, requireRoles(...ADMIN_ROLES), getAnalytics);
router.get("/pipeline", protect, requireRoles(...ADMIN_ROLES), getPipeline);
router.get(
  "/sub-admins/leaderboard",
  protect,
  requireRoles(...ADMIN_ROLES),
  getSubAdminLeaderboard
);
router.get(
  "/sub-admins/users",
  protect,
  requireRoles(...ADMIN_ROLES),
  getSubAdminUsers
);
router.get("/support-requests", protect, requireRoles(...ADMIN_ROLES), listSupportRequests);
router.patch(
  "/support-requests/:id/review",
  protect,
  requireRoles(...ADMIN_ROLES),
  reviewSupportRequest
);

export default router;

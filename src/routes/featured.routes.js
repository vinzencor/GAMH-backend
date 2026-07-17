import { Router } from "express";
import {
  listFeaturedUsers,
  submitFeaturedRequest,
  getMyFeaturedRequests,
  cancelMyFeaturedRequest,
  listAllFeaturedRequests,
  reviewFeaturedRequest,
  removeFeatured,
  adminListFeatured,
} from "../controllers/featured.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";

const router = Router();

// Public
router.get("/", listFeaturedUsers);

// User
router.post("/request", protect, submitFeaturedRequest);
router.get("/my-requests", protect, getMyFeaturedRequests);
router.delete("/my-requests", protect, cancelMyFeaturedRequest);

// Admin
router.get(
  "/admin/all",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  adminListFeatured
);
router.get(
  "/admin/requests",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  listAllFeaturedRequests
);
router.patch(
  "/admin/requests/:requestId/review",
  protect,
  requireRoles("super_admin", "content_admin"),
  reviewFeaturedRequest
);
router.delete(
  "/admin/:userId",
  protect,
  requireRoles("super_admin", "content_admin"),
  removeFeatured
);

export default router;

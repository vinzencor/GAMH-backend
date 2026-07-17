import { Router } from "express";
import {
  submitRoleRequest,
  getMyRoleRequests,
  listRoleRequests,
  reviewRoleRequest,
} from "../controllers/roleRequest.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";

const router = Router();

// User
router.post("/", protect, submitRoleRequest);
router.get("/my-requests", protect, getMyRoleRequests);

// Admin
router.get("/admin/all", protect, requireRoles("super_admin"), listRoleRequests);
router.patch("/admin/:requestId/review", protect, requireRoles("super_admin"), reviewRoleRequest);

export default router;

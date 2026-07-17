import { Router } from "express";
import {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getMyMembership,
  applyMembership,
  cancelMembership,
  listMemberships,
  adminApproveMembership,
  adminRenewMembership,
  getMyInvoices,
  listAllInvoices,
  checkPPVAccess,
  purchasePPV,
} from "../controllers/membership.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";
import { upload, uploadToS3, setUploadFolder } from "../utils/upload.js";

const router = Router();

// Plans – public read, admin write
router.get("/plans", listPlans);
router.post("/plans", protect, requireRoles("super_admin", "content_admin"), createPlan);
router.patch("/plans/:id", protect, requireRoles("super_admin", "content_admin"), updatePlan);
router.delete("/plans/:id", protect, requireRoles("super_admin"), deletePlan);

// User membership
router.get("/my", protect, getMyMembership);
router.post(
  "/apply",
  protect,
  setUploadFolder("images"),
  upload.single("screenshot"),
  uploadToS3,
  applyMembership
);
router.post("/cancel", protect, cancelMembership);

// Admin membership management
router.get(
  "/all",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  listMemberships
);
router.patch(
  "/:membershipId/approve",
  protect,
  requireRoles("super_admin", "content_admin"),
  adminApproveMembership
);
router.patch(
  "/:membershipId/renew",
  protect,
  requireRoles("super_admin", "content_admin"),
  adminRenewMembership
);

// Invoices
router.get("/invoices/my", protect, getMyInvoices);
router.get(
  "/invoices/all",
  protect,
  requireRoles("super_admin", "content_admin"),
  listAllInvoices
);

// Pay-per-view
router.get("/ppv/check/:contentId", protect, checkPPVAccess);
router.post("/ppv/purchase", protect, purchasePPV);

export default router;

import { Router } from "express";
import {
  getProfile,
  updateProfile,
  listUsers,
  listPublicDirectory,
  assignRoles,
  addRole,
  removeRole,
  setReviewerCategory,
  getRoleModuleAccess,
  setRoleModuleAccess,
  toggleUserActive,
  deleteUser,
  updateUserAccount,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";

const router = Router();

// Own profile
router.get("/me", protect, getProfile);
router.patch("/me", protect, updateProfile);

// Public directory (authors/reviewers) — no auth required, safe fields only.
// Must be registered before "/:id" so "directory" isn't swallowed as a user id.
router.get("/public/directory", listPublicDirectory);

// Public profile view (by id)
router.get("/:id", getProfile);

// Admin routes
router.get("/", protect, requireRoles("super_admin", "content_admin", "editor"), listUsers);
router.patch("/:userId/roles", protect, requireRoles("super_admin"), assignRoles);
router.post("/:userId/roles/add", protect, requireRoles("super_admin"), addRole);
router.post("/:userId/roles/remove", protect, requireRoles("super_admin"), removeRole);
router.patch("/:userId/reviewer-category", protect, requireRoles("super_admin"), setReviewerCategory);
router.patch("/:userId/toggle-active", protect, requireRoles("super_admin"), toggleUserActive);
router.patch("/:userId/account", protect, requireRoles("super_admin"), updateUserAccount);
router.delete("/:userId", protect, requireRoles("super_admin"), deleteUser);


// Role module access
router.get(
  "/admin/role-module-access",
  protect,
  requireRoles("super_admin"),
  getRoleModuleAccess
);
router.post(
  "/admin/role-module-access",
  protect,
  requireRoles("super_admin"),
  setRoleModuleAccess
);

export default router;

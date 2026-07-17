import { Router } from "express";
import {
  createSupportTicket,
  listSupportTickets,
  updateSupportTicket,
} from "../controllers/supportTicket.controller.js";
import { optionalAuth, protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";

const router = Router();

// Public — works for both logged-in users and guests.
router.post("/", optionalAuth, createSupportTicket);

// Admin
router.get(
  "/",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  listSupportTickets
);
router.patch(
  "/:id",
  protect,
  requireRoles("super_admin", "content_admin", "editor"),
  updateSupportTicket
);

export default router;

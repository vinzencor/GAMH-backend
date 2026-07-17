import { Router } from "express";
import { createSupportRequest, createPasswordResetRequest } from "../controllers/support.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

// Email-change requests require a logged-in session (see support.controller.js).
router.post("/", protect, createSupportRequest);
// Forgot-password requests are public — the user can't log in to submit one.
router.post("/password-reset", createPasswordResetRequest);

export default router;

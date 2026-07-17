import { Router } from "express";
import {
  register,
  registerWithMembership,
  login,
  refreshToken,
  getMe,
  changePassword,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload, uploadToS3, setUploadFolder } from "../utils/upload.js";

const router = Router();

router.post("/register", register);
router.post(
  "/register-with-membership",
  setUploadFolder("images"),
  upload.single("screenshot"),
  uploadToS3,
  registerWithMembership
);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.get("/me", protect, getMe);
router.patch("/change-password", protect, changePassword);

export default router;

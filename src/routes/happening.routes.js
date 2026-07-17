import express from "express";
import {
  getHappenings,
  createHappening,
  updateHappening,
  deleteHappening,
} from "../controllers/happening.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireRoles } from "../middleware/role.middleware.js";
import { setUploadFolder, upload, uploadToS3 } from "../utils/upload.js";

const router = express.Router();

// Public route to get active happenings
router.get("/", getHappenings);

// Super admin routes
router.post("/", protect, requireRoles("super_admin"), createHappening);
router.put("/:id", protect, requireRoles("super_admin"), updateHappening);
router.delete("/:id", protect, requireRoles("super_admin"), deleteHappening);

router.post(
  "/upload",
  protect,
  requireRoles("super_admin"),
  setUploadFolder("images"),
  upload.single("image"),
  uploadToS3,
  (req, res) => {
    if (!req.file || !req.file.s3Url) {
      return res.status(400).json({ success: false, message: "Image upload failed." });
    }
    res.json({ success: true, data: { url: req.file.s3Url } });
  }
);

export default router;

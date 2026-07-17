import mongoose from "mongoose";
import { MODULE_KEYS, ROLES } from "../config/constants.js";

/**
 * Stores per-role default module access settings.
 * Individual user overrides live on User.moduleAccess.
 */
const roleModuleAccessSchema = new mongoose.Schema(
  {
    roleName: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },
    moduleKey: {
      type: String,
      enum: MODULE_KEYS,
      required: true,
    },
    canAccess: { type: Boolean, default: false },
  },
  { timestamps: true }
);

roleModuleAccessSchema.index({ roleName: 1, moduleKey: 1 }, { unique: true });

const RoleModuleAccess = mongoose.model("RoleModuleAccess", roleModuleAccessSchema);
export default RoleModuleAccess;

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES } from "../config/constants.js";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    fullName: { type: String, required: [true, "Full name is required"], trim: true },
    institution: { type: String, trim: true, default: "" },
    bio: { type: String, default: "" },
    reviewerCategory: { type: String, default: "" },
    photoUrl: { type: String, default: "" },
    emailHistory: {
      type: [String],
      default: [],
    },
    socialLinks: {
      type: Map,
      of: String,
      default: {},
    },
    roles: {
      type: [String],
      enum: Object.values(ROLES),
      default: [ROLES.REGISTERED_USER],
    },
    // Module access overrides per user (role-based handled separately)
    moduleAccess: {
      type: Map,
      of: Boolean,
      default: {},
    },
    isEmailVerified: { type: Boolean, default: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.hasRole = function (role) {
  return this.roles.includes(role);
};

userSchema.methods.hasAnyRole = function (roles) {
  return roles.some((r) => this.roles.includes(r));
};

// Strip sensitive fields from JSON output
userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.emailHistory;
  return obj;
};

userSchema.statics.findByEmailOrHistory = function (email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  return this.findOne({
    $or: [{ email: normalized }, { emailHistory: normalized }],
  });
};

const User = mongoose.model("User", userSchema);
export default User;

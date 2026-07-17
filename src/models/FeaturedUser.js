import mongoose from "mongoose";
import { FEATURED_REQUEST_STATUSES } from "../config/constants.js";

const featuredUserSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "featuredusers" }
);

export const FeaturedUser = mongoose.model("FeaturedUser", featuredUserSchema);

// ─── Featured User Request ────────────────────────────────────────────────────

const featuredUserRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: FEATURED_REQUEST_STATUSES,
      default: "pending",
    },
    note: { type: String, default: "" },
    adminNote: { type: String, default: "" },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: { type: Date },
  },
  { timestamps: true, collection: "featureduserrequests" }
);

export const FeaturedUserRequest = mongoose.model(
  "FeaturedUserRequest",
  featuredUserRequestSchema
);

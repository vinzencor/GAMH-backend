import mongoose from "mongoose";
import { MEMBERSHIP_STATUSES } from "../config/constants.js";

const membershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MembershipPlan",
      required: true,
    },
    status: {
      type: String,
      enum: MEMBERSHIP_STATUSES,
      default: "pending_verification",
    },
    startsAt: { type: Date },
    endsAt: { type: Date },
    cancelledAt: { type: Date },
    renewedAt: { type: Date },
    suspendedAt: { type: Date },
    screenshotUrl: { type: String, default: "" },
    requestFeatured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

membershipSchema.index({ user: 1, status: 1 });

const Membership = mongoose.model("Membership", membershipSchema);
export default Membership;

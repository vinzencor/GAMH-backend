import mongoose from "mongoose";

const supportRequestSchema = new mongoose.Schema(
  {
    requesterUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    currentEmail: { type: String, required: true, lowercase: true, trim: true },
    requestedEmail: { type: String, default: "", lowercase: true, trim: true },
    passwordResetRequested: { type: Boolean, default: false },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    adminNote: { type: String, default: "" },
    resolvedEmail: { type: String, default: "" },
  },
  { timestamps: true }
);

const SupportRequest = mongoose.model("SupportRequest", supportRequestSchema);

export default SupportRequest;
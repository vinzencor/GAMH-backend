import mongoose from "mongoose";

const DECISIONS = ["approved", "rejected", "changes_requested"];

const reviewDecisionSchema = new mongoose.Schema(
  {
    content: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContentItem",
      required: true,
    },
    decidedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    decision: { type: String, enum: DECISIONS, required: true },
    decisionNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

const ReviewDecision = mongoose.model("ReviewDecision", reviewDecisionSchema);
export default ReviewDecision;

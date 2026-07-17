import mongoose from "mongoose";

const ACTIONS = [
  "submitted",
  "approved",
  "changes_requested",
  "rejected",
  "resubmitted",
  "reassigned",
  "changes_review_approved",
  "changes_review_declined",
];

const workflowLogSchema = new mongoose.Schema(
  {
    content: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "contentModel",
      required: true,
    },
    contentModel: {
      type: String,
      enum: ["ContentItem", "JournalSubmission"],
      default: "ContentItem",
    },
    stage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowStage",
    },
    stageIndex: { type: Number },
    action: { type: String, enum: ACTIONS, required: true },
    comment: { type: String, default: "" },
    actedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

const WorkflowLog = mongoose.model("WorkflowLog", workflowLogSchema);
export default WorkflowLog;

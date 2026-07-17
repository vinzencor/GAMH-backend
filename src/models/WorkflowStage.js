import mongoose from "mongoose";

const workflowStageSchema = new mongoose.Schema(
  {
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowTemplate",
      required: true,
    },
    stageName: { type: String, required: true, trim: true },
    orderIndex: { type: Number, required: true },
    assignedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

workflowStageSchema.index({ template: 1, orderIndex: 1 });

const WorkflowStage = mongoose.model("WorkflowStage", workflowStageSchema);
export default WorkflowStage;

import mongoose from "mongoose";

const workflowTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const WorkflowTemplate = mongoose.model("WorkflowTemplate", workflowTemplateSchema);
export default WorkflowTemplate;

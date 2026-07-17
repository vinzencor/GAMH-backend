import mongoose from "mongoose";
import { REVIEW_STATUSES, REVIEW_RECOMMENDATIONS } from "../config/constants.js";

const reviewSchema = new mongoose.Schema(
  {
    content: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    contentModel: {
      type: String,
      enum: ["ContentItem", "JournalSubmission"],
      default: "ContentItem",
      required: true,
    },
    reviewerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: REVIEW_STATUSES,
      default: "assigned",
    },
    recommendation: {
      type: String,
      enum: REVIEW_RECOMMENDATIONS,
    },
    commentsToEditor: { type: String, default: "" },
    commentsToAuthor: { type: String, default: "" },
    dueDate: { type: Date },
    submittedAt: { type: Date },
    assignmentMode: {
      type: String,
      enum: ["single", "bucket_choice"],
      default: "single",
    },
    selectionGroupId: { type: String, default: null },
    selectedAt: { type: Date },
  },
  { timestamps: true }
);

reviewSchema.path("content").options.refPath = "contentModel";

const Review = mongoose.model("Review", reviewSchema);
export default Review;

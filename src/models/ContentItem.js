import mongoose from "mongoose";
import {
  CONTENT_STATUSES,
  WORKFLOW_STATUSES,
  ACCESS_MODES,
  CONTENT_TYPES,
} from "../config/constants.js";
import slugify from "slugify";

const contentItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    type: { type: String, enum: CONTENT_TYPES, default: "article" },
    status: { type: String, enum: CONTENT_STATUSES, default: "draft" },
    workflowStatus: {
      type: String,
      enum: WORKFLOW_STATUSES,
      default: "draft",
    },
    summary: { type: String, default: "" }, // abstract
    body: { type: String, default: "" },    // full content
    coverImageUrl: { type: String, default: "" },
    keywords: [{ type: String }],
    coAuthors: [{ type: String }],
    authorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workflowTemplate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowTemplate",
    },
    currentStageIndex: { type: Number, default: 0 },
    accessMode: {
      type: String,
      enum: ACCESS_MODES,
      default: "open_access",
    },
    ppvPrice: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    showOnHomepage: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    copyCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Auto-generate slug from title
contentItemSchema.pre("save", function (next) {
  if (this.isModified("title") || !this.slug) {
    this.slug = slugify(this.title, { lower: true, strict: true }) + "-" + Date.now();
  }
  next();
});

const ContentItem = mongoose.model("ContentItem", contentItemSchema);
export default ContentItem;

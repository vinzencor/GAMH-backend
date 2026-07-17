import mongoose from "mongoose";
import slugify from "slugify";

const JOURNAL_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested_awaiting_admin",
  "changes_requested",
  "accepted",
  "published",
  "rejected",
  "rejected_pending_reassignment",
  "withdrawn",
];

const journalSubmissionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    abstract: { type: String, default: "" },
    originalAuthorName: { type: String, default: "", trim: true },
    body: { type: String, default: "" },
    manuscriptUrl: { type: String, default: "" },
    supplementaryFileUrl: { type: String, default: "" },
    coverImageUrl: { type: String, default: "" },
    keywords: [{ type: String }],
    coAuthors: [{ type: String }],
    institution: { type: String, default: "" },
    status: { type: String, enum: JOURNAL_STATUSES, default: "draft" },
    authorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workflowTemplate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowTemplate",
      default: null,
    },
    currentStageIndex: { type: Number, default: 0 },
    // When a reviewer requests changes, store which stage sent it back
    returnToStageIndex: { type: Number, default: null },
    // Reviewer feedback shown to the author
    reviewerComment: { type: String, default: "" },
    // Publication settings
    accessMode: {
      type: String,
      enum: ["open_access", "members_only", "pay_per_view"],
      default: "open_access",
    },
    publishDate: { type: Date, default: null },
    ppvPrice: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    copyCount: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    uploadedBySuperAdmin: { type: Boolean, default: false },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "awaiting_verification", "paid"],
      default: "unpaid",
    },
    paymentProofUrl: { type: String, default: "" },
    paymentAmount: { type: Number, default: 0 },
    paymentVerifiedAt: { type: Date, default: null },
    paymentVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    paymentRejectionReason: { type: String, default: "" },
    withdrawnAt: { type: Date, default: null },
    withdrawalReason: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

journalSubmissionSchema.pre("save", function (next) {
  if (this.isModified("title") || !this.slug) {
    this.slug = `${slugify(this.title, { lower: true, strict: true })}-${Date.now()}`;
  }
  next();
});

const JournalSubmission = mongoose.model("JournalSubmission", journalSubmissionSchema);

export default JournalSubmission;
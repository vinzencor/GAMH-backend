import mongoose from "mongoose";

const libraryItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    abstract: { type: String, default: "" },
    authorsJson: [
      {
        name: String,
        institution: String,
      },
    ],
    venue: { type: String, default: "" },
    year: { type: Number },
    category: { type: String, default: "" },
    accessType: {
      type: String,
      enum: ["open", "members_only"],
      default: "open",
    },
    submissionStatus: {
      type: String,
      enum: ["draft", "submitted", "changes_requested", "published", "rejected"],
      default: "published",
    },
    reviewNote: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    pdfUrl: { type: String, default: "" },
    viewCount: { type: Number, default: 0 },
    copyCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const LibraryItem = mongoose.model("LibraryItem", libraryItemSchema);
export default LibraryItem;

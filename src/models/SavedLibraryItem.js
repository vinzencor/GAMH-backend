import mongoose from "mongoose";

const savedLibraryItemSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    libraryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LibraryItem",
      required: true,
    },
  },
  { timestamps: true }
);

savedLibraryItemSchema.index({ user: 1, libraryItem: 1 }, { unique: true });

const SavedLibraryItem = mongoose.model("SavedLibraryItem", savedLibraryItemSchema);
export default SavedLibraryItem;

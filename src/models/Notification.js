import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // Admin-facing notifications use recipientRole ("super_admin"). User-facing
    // (e.g. author) notifications instead set recipientUser to a specific user
    // and leave recipientRole null. Exactly one of the two should be set.
    recipientRole: { type: String, default: "super_admin" },
    recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    type: {
      type: String,
      enum: [
        "journal_withdrawn",
        "journal_rejected",
        "journal_rejected_pending_reassignment",
        "journal_final_rejected",
        "journal_changes_requested_review",
        "journal_changes_forwarded",
        "journal_ready_to_publish",
        "membership_approved",
        "payment_rejected",
        "payment_approved",
        "support_request",
        "support_request_update",
        "support_ticket",
        "support_ticket_update",
        "general",
      ],
      default: "general",
    },
    message: { type: String, required: true },
    relatedJournal: { type: mongoose.Schema.Types.ObjectId, ref: "JournalSubmission", default: null },
    relatedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;

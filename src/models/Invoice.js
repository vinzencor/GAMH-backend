import mongoose from "mongoose";
import { INVOICE_STATUSES } from "../config/constants.js";

const invoiceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    membership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Membership",
    },
    journal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalSubmission",
      default: null,
    },
    type: {
      type: String,
      enum: ["membership", "journal"],
      default: "membership",
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      default: "unpaid",
    },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

const Invoice = mongoose.model("Invoice", invoiceSchema);
export default Invoice;

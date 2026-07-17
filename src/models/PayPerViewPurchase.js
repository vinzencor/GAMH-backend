import mongoose from "mongoose";

const payPerViewPurchaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContentItem",
      required: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    purchasedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
  { timestamps: false }
);

payPerViewPurchaseSchema.index({ user: 1, content: 1 }, { unique: true });

const PayPerViewPurchase = mongoose.model("PayPerViewPurchase", payPerViewPurchaseSchema);
export default PayPerViewPurchase;

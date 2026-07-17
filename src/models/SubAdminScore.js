import mongoose from "mongoose";

/**
 * Sub-admin gamification scores (Bronze/Silver/Gold/Platinum/Diamond tiers).
 * One record per sub_admin user.
 */
const subAdminScoreSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    totalScore: { type: Number, default: 0 },
    approvals: { type: Number, default: 0 },
    changesRequested: { type: Number, default: 0 },
    rejections: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActivityAt: { type: Date },
  },
  { timestamps: true }
);

const SubAdminScore = mongoose.model("SubAdminScore", subAdminScoreSchema);
export default SubAdminScore;

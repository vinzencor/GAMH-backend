import Notification from "../models/Notification.js";
import { catchAsync, sendSuccess } from "../utils/helpers.js";

// List notifications for super admins (most recent first)
export const listNotifications = catchAsync(async (req, res) => {
  const { limit = 50, unreadOnly } = req.query;
  const filter = { recipientRole: "super_admin" };
  if (unreadOnly === "true") filter.read = false;

  const notifications = await Notification.find(filter)
    .populate("relatedUser", "fullName email")
    .populate("relatedJournal", "title status")
    .sort({ createdAt: -1 })
    .limit(Number(limit));

  const unreadCount = await Notification.countDocuments({ recipientRole: "super_admin", read: false });

  sendSuccess(res, { notifications, unreadCount });
});

// Mark a single notification as read
export const markRead = catchAsync(async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { read: true });
  sendSuccess(res, null, 200, "Marked as read.");
});

// Mark all super_admin notifications as read
export const markAllRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ recipientRole: "super_admin", read: false }, { read: true });
  sendSuccess(res, null, 200, "All notifications marked as read.");
});

// ─── Author/user-facing notifications (own account only) ────────────────────

export const listMyNotifications = catchAsync(async (req, res) => {
  const { limit = 50, unreadOnly } = req.query;
  const filter = { recipientUser: req.user._id };
  if (unreadOnly === "true") filter.read = false;

  const notifications = await Notification.find(filter)
    .populate("relatedJournal", "title status")
    .sort({ createdAt: -1 })
    .limit(Number(limit));

  const unreadCount = await Notification.countDocuments({ recipientUser: req.user._id, read: false });

  sendSuccess(res, { notifications, unreadCount });
});

export const markMyRead = catchAsync(async (req, res) => {
  // Scoped to req.user._id so a user can never mark someone else's notification as read
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientUser: req.user._id },
    { read: true }
  );
  sendSuccess(res, null, 200, "Marked as read.");
});

export const markAllMyRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ recipientUser: req.user._id, read: false }, { read: true });
  sendSuccess(res, null, 200, "All notifications marked as read.");
});

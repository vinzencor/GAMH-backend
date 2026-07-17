import crypto from "crypto";
import SupportRequest from "../models/SupportRequest.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";
import { sendEmail } from "../utils/email.js";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function generateTemporaryPassword() {
  return crypto.randomBytes(8).toString("hex");
}

// Email-change requests must come from an authenticated session — the
// current email is always taken from the logged-in user, never from the
// request body, so a requester can't submit a change request while
// impersonating someone else's address. A current-password confirmation is
// also required as a lightweight re-auth check for this sensitive action.
export const createSupportRequest = catchAsync(async (req, res, next) => {
  if (!req.user) return next(createError("Please log in to request an email change.", 401));

  const requestedEmail = normalizeEmail(req.body.requestedEmail);
  const currentPassword = String(req.body.currentPassword || "");
  const reason = String(req.body.reason || "").trim();

  if (!requestedEmail) return next(createError("Please provide the new email you'd like to use.", 400));
  if (!currentPassword) return next(createError("Please confirm your current password.", 400));
  if (!reason) return next(createError("Reason for the request is required.", 400));

  const user = await User.findById(req.user._id).select("+password");
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) return next(createError("Current password is incorrect.", 401));

  const currentEmail = normalizeEmail(user.email);
  if (requestedEmail === currentEmail) {
    return next(createError("The new email must be different from your current email.", 400));
  }

  const request = await SupportRequest.create({
    requesterUser: user._id,
    currentEmail,
    requestedEmail,
    passwordResetRequested: false,
    reason,
  });

  await Notification.create({
    recipientRole: "super_admin",
    type: "support_request",
    message: `Email change request submitted for ${currentEmail} -> ${requestedEmail}.`,
    relatedUser: user._id,
  });

  sendSuccess(res, request, 201, "Support request submitted.");
});

// Forgot-password requests can't require login (the user is locked out), so
// this stays a public endpoint keyed only on the email they claim as theirs.
// Nothing is changed automatically here — an admin reviews it and manually
// resets the password from the Admin Portal, then the new password is
// emailed to the account's registered address.
export const createPasswordResetRequest = catchAsync(async (req, res, next) => {
  const currentEmail = normalizeEmail(req.body.currentEmail);
  const reason = String(req.body.reason || "").trim();

  if (!currentEmail) return next(createError("Please enter your registered email.", 400));

  const requesterUser = await User.findByEmailOrHistory(currentEmail);
  if (!requesterUser) {
    return next(createError("No account found with that email address.", 404));
  }

  const request = await SupportRequest.create({
    requesterUser: requesterUser._id,
    currentEmail,
    requestedEmail: "",
    passwordResetRequested: true,
    reason: reason || "Password reset requested via Forgot Password page.",
  });

  await Notification.create({
    recipientRole: "super_admin",
    type: "support_request",
    message: `Password reset request submitted for ${currentEmail}.`,
    relatedUser: requesterUser._id,
  });

  sendSuccess(res, request, 201, "Support request submitted.");
});

export const listSupportRequests = catchAsync(async (req, res) => {
  const { status, limit = 100, page = 1 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    SupportRequest.find(filter)
      .populate("requesterUser", "fullName email institution roles")
      .populate("reviewedBy", "fullName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    SupportRequest.countDocuments(filter),
  ]);

  sendSuccess(res, { items, total, page: Number(page), limit: Number(limit) });
});

export const reviewSupportRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { action, adminNote = "", newPassword, newEmail } = req.body;

  if (!["approve", "reject"].includes(action)) {
    return next(createError("action must be either approve or reject.", 400));
  }

  const request = await SupportRequest.findById(id);
  if (!request) return next(createError("Support request not found.", 404));
  if (request.status !== "pending") return next(createError("This support request has already been processed.", 400));

  const userId = request.requesterUser?._id || request.requesterUser || null;
  let user = userId ? await User.findById(userId).select("+password") : null;
  if (!user) {
    const fallbackUser = await User.findByEmailOrHistory(request.currentEmail);
    user = fallbackUser ? await User.findById(fallbackUser._id).select("+password") : null;
  }
  if (!user) return next(createError("User not found.", 404));

  const currentEmail = normalizeEmail(user.email);
  const requestedEmail = normalizeEmail(newEmail || request.requestedEmail);

  request.reviewedBy = req.user._id;
  request.reviewedAt = new Date();
  request.adminNote = String(adminNote || "").trim();

  if (action === "reject") {
    request.status = "rejected";
    await request.save();

    await Notification.create({
      recipientRole: "super_admin",
      type: "support_request_update",
      message: `Support request for ${currentEmail} was rejected by ${req.user.fullName || "an admin"}.`,
      relatedUser: user._id,
    });

    await Notification.create({
      recipientUser: user._id,
      type: "support_request_update",
      message: `Your support request for ${requestedEmail && requestedEmail !== currentEmail ? `email update to ${requestedEmail}` : "account access"} was rejected.`,
      relatedUser: user._id,
    });

    sendSuccess(res, request, 200, "Support request rejected.");
    return;
  }

  let updatedEmail = currentEmail;
  let temporaryPassword = null;

  if (requestedEmail && requestedEmail !== currentEmail) {
    const emailConflict = await User.findOne({
      _id: { $ne: user._id },
      $or: [{ email: requestedEmail }, { emailHistory: requestedEmail }],
    });
    if (emailConflict) {
      return next(createError("This email is already registered.", 409));
    }

    if (!user.emailHistory.includes(currentEmail)) {
      user.emailHistory.push(currentEmail);
    }
    user.email = requestedEmail;
    updatedEmail = requestedEmail;
  }

  if (request.passwordResetRequested) {
    temporaryPassword = String(newPassword || "").trim() || generateTemporaryPassword();
    user.password = temporaryPassword;
  }

  await user.save();

  request.status = "completed";
  request.completedAt = new Date();
  request.resolvedEmail = updatedEmail;
  await request.save();

  const emailText = [
    "Your GAMH support request has been completed.",
    requestedEmail && requestedEmail !== currentEmail
      ? `Your email address has been updated to ${updatedEmail}.`
      : null,
    request.passwordResetRequested && temporaryPassword
      ? `Your password has been reset. Temporary password: ${temporaryPassword}`
      : null,
    request.adminNote ? `Admin note: ${request.adminNote}` : null,
  ].filter(Boolean).join("\n\n");

  await sendEmail({
    to: updatedEmail,
    subject: "GAMH Support Request Completed",
    text: emailText,
    html: emailText.replace(/\n/g, "<br />"),
  });

  await Notification.create({
    recipientRole: "super_admin",
    type: "support_request_update",
    message: `Support request for ${currentEmail} was approved and completed by ${req.user.fullName || "an admin"}.`,
    relatedUser: user._id,
  });

  await Notification.create({
    recipientUser: user._id,
    type: "support_request_update",
    message: requestedEmail && requestedEmail !== currentEmail
      ? `Your email address was updated to ${updatedEmail}.`
      : request.passwordResetRequested
      ? "Your password reset request has been completed."
      : "Your support request has been completed.",
    relatedUser: user._id,
  });

  sendSuccess(res, { request, temporaryPassword }, 200, "Support request approved and processed.");
});
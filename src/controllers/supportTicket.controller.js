import SupportTicket from "../models/SupportTicket.js";
import Notification from "../models/Notification.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";

// ─── Public (or logged-in): submit a general support/issue ticket ────────────
export const createSupportTicket = catchAsync(async (req, res, next) => {
  const name = String(req.body.name || req.user?.fullName || "").trim();
  const email = String(req.body.email || req.user?.email || "").trim().toLowerCase();
  const category = String(req.body.category || "general");
  const subject = String(req.body.subject || "").trim();
  const description = String(req.body.description || "").trim();

  if (!name) return next(createError("Please provide your name.", 400));
  if (!email) return next(createError("Please provide your email.", 400));
  if (!subject) return next(createError("Please provide a subject.", 400));
  if (!description) return next(createError("Please describe the issue.", 400));

  const ticket = await SupportTicket.create({
    requesterUser: req.user?._id || null,
    name,
    email,
    category,
    subject,
    description,
  });

  await Notification.create({
    recipientRole: "super_admin",
    type: "support_ticket",
    message: `New support ticket: "${subject}" from ${name} (${email}).`,
    relatedUser: req.user?._id || null,
  });

  sendSuccess(res, ticket, 201, "Support ticket submitted.");
});

// ─── Admin: list all support tickets ──────────────────────────────────────────
export const listSupportTickets = catchAsync(async (req, res) => {
  const { status, category, page = 1, limit = 100 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    SupportTicket.find(filter)
      .populate("requesterUser", "fullName email")
      .populate("resolvedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    SupportTicket.countDocuments(filter),
  ]);

  sendSuccess(res, { items, total, page: Number(page), limit: Number(limit) });
});

// ─── Admin: update ticket status / add a note ─────────────────────────────────
export const updateSupportTicket = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;

  const ticket = await SupportTicket.findById(id);
  if (!ticket) return next(createError("Support ticket not found.", 404));

  if (status) {
    if (!["open", "in_progress", "resolved"].includes(status)) {
      return next(createError("Invalid status.", 400));
    }
    ticket.status = status;
    if (status === "resolved") {
      ticket.resolvedBy = req.user._id;
      ticket.resolvedAt = new Date();
    }
  }
  if (adminNote !== undefined) ticket.adminNote = String(adminNote).trim();

  await ticket.save();

  if (ticket.requesterUser) {
    await Notification.create({
      recipientUser: ticket.requesterUser,
      type: "support_ticket_update",
      message: `Your support ticket "${ticket.subject}" was updated to "${ticket.status}".`,
      relatedUser: ticket.requesterUser,
    });
  }

  sendSuccess(res, ticket, 200, "Support ticket updated.");
});

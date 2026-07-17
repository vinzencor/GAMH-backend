import RoleRequest from "../models/RoleRequest.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";

// Only these roles are self-requestable — admin/editorial roles must always
// be granted directly by a super admin, never via a user-submitted request.
const REQUESTABLE_ROLES = ["author", "reviewer", "subscriber"];

// ─── User: submit a role request ──────────────────────────────────────────────
export const submitRoleRequest = catchAsync(async (req, res, next) => {
  const { role, note } = req.body;

  if (!REQUESTABLE_ROLES.includes(role)) {
    return next(createError(`role must be one of: ${REQUESTABLE_ROLES.join(", ")}`, 400));
  }
  if (req.user.roles.includes(role)) {
    return next(createError("You already have this role.", 400));
  }

  const existing = await RoleRequest.findOne({
    user: req.user._id,
    requestedRole: role,
    status: "pending",
  });
  if (existing) return next(createError("You already have a pending request for this role.", 409));

  const request = await RoleRequest.create({
    user: req.user._id,
    requestedRole: role,
    note: note || "",
  });

  await Notification.create({
    recipientRole: "super_admin",
    type: "general",
    message: `${req.user.fullName || req.user.email} requested the "${role}" role.`,
    relatedUser: req.user._id,
  });

  sendSuccess(res, request, 201, "Role request submitted.");
});

// ─── User: get my role requests ───────────────────────────────────────────────
export const getMyRoleRequests = catchAsync(async (req, res) => {
  const requests = await RoleRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
  sendSuccess(res, requests);
});

// ─── Admin: list all role requests ────────────────────────────────────────────
export const listRoleRequests = catchAsync(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const requests = await RoleRequest.find(filter)
    .populate("user", "fullName email institution roles")
    .populate("reviewedBy", "fullName")
    .sort({ createdAt: -1 });
  sendSuccess(res, requests);
});

// ─── Admin: approve / reject a role request ───────────────────────────────────
export const reviewRoleRequest = catchAsync(async (req, res, next) => {
  const { requestId } = req.params;
  const { approve, adminNote } = req.body;

  const request = await RoleRequest.findById(requestId);
  if (!request) return next(createError("Request not found.", 404));
  if (request.status !== "pending") return next(createError("This request has already been processed.", 400));

  const isApprove = approve === true || approve === "true";

  request.status = isApprove ? "approved" : "rejected";
  request.adminNote = adminNote || "";
  request.reviewedBy = req.user._id;
  request.reviewedAt = new Date();
  await request.save();

  if (isApprove) {
    await User.findByIdAndUpdate(request.user, { $addToSet: { roles: request.requestedRole } });
  }

  await Notification.create({
    recipientUser: request.user,
    type: "general",
    message: isApprove
      ? `Your request for the "${request.requestedRole}" role was approved.`
      : `Your request for the "${request.requestedRole}" role was rejected.`,
    relatedUser: request.user,
  });

  sendSuccess(res, request, 200, `Request ${isApprove ? "approved" : "rejected"}.`);
});

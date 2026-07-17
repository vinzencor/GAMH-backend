import { FeaturedUser, FeaturedUserRequest } from "../models/FeaturedUser.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";

// ─── Public: list featured users ─────────────────────────────────────────────
export const listFeaturedUsers = catchAsync(async (req, res) => {
  const featured = await FeaturedUser.find({ isFeatured: true })
    .populate("user", "fullName institution bio photoUrl socialLinks")
    .sort({ updatedAt: -1 });
  sendSuccess(res, featured.map((f) => f.user));
});

// ─── User: submit featured request ───────────────────────────────────────────
export const submitFeaturedRequest = catchAsync(async (req, res, next) => {
  const { note } = req.body;

  // Check if pending request already exists
  const existing = await FeaturedUserRequest.findOne({
    user: req.user._id,
    status: "pending",
  });
  if (existing) return next(createError("You already have a pending featured request.", 409));

  const request = await FeaturedUserRequest.create({
    user: req.user._id,
    note: note || "",
  });

  sendSuccess(res, request, 201, "Request submitted.");
});

// ─── User: get my featured requests ──────────────────────────────────────────
export const getMyFeaturedRequests = catchAsync(async (req, res) => {
  const requests = await FeaturedUserRequest.find({ user: req.user._id }).sort({
    createdAt: -1,
  });
  sendSuccess(res, requests);
});

// ─── User: cancel my pending featured request ─────────────────────────────────
export const cancelMyFeaturedRequest = catchAsync(async (req, res, next) => {
  const request = await FeaturedUserRequest.findOne({
    user: req.user._id,
    status: "pending",
  });
  if (!request) return next(createError("No pending featured request found.", 404));

  await request.deleteOne();
  sendSuccess(res, null, 200, "Featured request cancelled.");
});

// ─── Admin: list all featured requests ───────────────────────────────────────
export const listAllFeaturedRequests = catchAsync(async (req, res) => {
  const requests = await FeaturedUserRequest.find({})
    .populate("user", "fullName email institution photoUrl")
    .populate("reviewedBy", "fullName")
    .sort({ createdAt: -1 });
  sendSuccess(res, requests);
});

// ─── Admin: approve / reject featured request ────────────────────────────────
export const reviewFeaturedRequest = catchAsync(async (req, res, next) => {
  const { requestId } = req.params;
  const { approve, adminNote } = req.body;

  const request = await FeaturedUserRequest.findById(requestId);
  if (!request) return next(createError("Request not found.", 404));

  request.status = approve ? "approved" : "rejected";
  request.adminNote = adminNote || "";
  request.reviewedBy = req.user._id;
  request.reviewedAt = new Date();
  await request.save();

  if (approve) {
    // Upsert featured user entry
    await FeaturedUser.findOneAndUpdate(
      { user: request.user },
      { isFeatured: true },
      { upsert: true, new: true }
    );
  }

  sendSuccess(res, request, 200, `Request ${approve ? "approved" : "rejected"}.`);
});

// ─── Admin: remove from featured ─────────────────────────────────────────────
export const removeFeatured = catchAsync(async (req, res, next) => {
  const entry = await FeaturedUser.findOneAndUpdate(
    { user: req.params.userId },
    { isFeatured: false },
    { new: true }
  );
  if (!entry) return next(createError("Featured user not found.", 404));
  sendSuccess(res, null, 200, "Removed from featured.");
});

// ─── Admin: list all featured users (management view) ────────────────────────
export const adminListFeatured = catchAsync(async (req, res) => {
  const featured = await FeaturedUser.find({})
    .populate("user", "fullName email institution photoUrl")
    .sort({ updatedAt: -1 });
  sendSuccess(res, featured);
});

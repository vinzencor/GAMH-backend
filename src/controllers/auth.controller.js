import User from "../models/User.js";
import Membership from "../models/Membership.js";
import MembershipPlan from "../models/MembershipPlan.js";
import Invoice from "../models/Invoice.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";
import { getUploadedS3Keys } from "../utils/upload.js";

// ─── Register ────────────────────────────────────────────────────────────────
export const register = catchAsync(async (req, res, next) => {
  const { email, password, fullName, institution } = req.body;

  if (!email || !password || !fullName) {
    return next(createError("Email, password, and full name are required.", 400));
  }

  const existing = await User.findByEmailOrHistory(email);
  if (existing) return next(createError("This email is already registered.", 409));

  const user = await User.create({ email, password, fullName, institution });

  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  sendSuccess(res, { accessToken, refreshToken, user: user.toSafeJSON() }, 201, "Registration successful.");
});

// ─── Register with membership application (single-step) ─────────────────────
export const registerWithMembership = catchAsync(async (req, res, next) => {
  const { email, password, fullName, institution, planId, requestFeatured } = req.body;

  if (!email || !password || !fullName || !planId) {
    return next(createError("Email, password, full name, and planId are required.", 400));
  }

  if (!req.file?.s3Url) {
    return next(createError("Payment screenshot upload is required.", 400));
  }

  const existing = await User.findByEmailOrHistory(email);
  if (existing) return next(createError("This email is already registered.", 409));

  const plan = await MembershipPlan.findById(planId);
  if (!plan || !plan.isActive) return next(createError("Plan not found or inactive.", 404));

  let user = null;
  let membership = null;
  let invoice = null;

  try {
    user = await User.create({ email, password, fullName, institution });

    membership = await Membership.create({
      user: user._id,
      plan: plan._id,
      status: "pending_verification",
      screenshotUrl: req.file.s3Url,
      requestFeatured: requestFeatured === true || requestFeatured === "true",
      startsAt: new Date(),
    });

    invoice = await Invoice.create({
      user: user._id,
      membership: membership._id,
      amount: plan.price,
      currency: "INR",
      status: "unpaid",
    });
  } catch (error) {
    if (invoice?._id) {
      await Invoice.findByIdAndDelete(invoice._id).catch(() => null);
    }
    if (membership?._id) {
      await Membership.findByIdAndDelete(membership._id).catch(() => null);
    }
    if (user?._id) {
      await User.findByIdAndDelete(user._id).catch(() => null);
    }
    throw error;
  }

  sendSuccess(
    res,
    {
      user: user.toSafeJSON(),
      membership,
      invoice,
      uploadedS3Keys: getUploadedS3Keys(req),
    },
    201,
    "Registration submitted. Account will be activated after payment verification."
  );
});

// ─── Login ───────────────────────────────────────────────────────────────────
export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(createError("Email and password are required.", 400));
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user || !user.isActive) {
    return next(createError("Invalid credentials.", 401));
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) return next(createError("Invalid credentials.", 401));

  // Determine membership status for login response
  const membership = await Membership.findOne({
    user: user._id,
    status: { $in: ["active", "renewal_due", "pending_verification"] },
  })
    .sort({ createdAt: -1 })
    .populate("plan");

  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  sendSuccess(res, {
    accessToken,
    refreshToken,
    user: user.toSafeJSON(),
    membership: membership || null,
  });
});

// ─── Refresh Token ───────────────────────────────────────────────────────────
export const refreshToken = catchAsync(async (req, res, next) => {
  const { refreshToken: token } = req.body;
  if (!token) return next(createError("Refresh token required.", 400));

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    return next(createError("Invalid or expired refresh token.", 401));
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) return next(createError("User not found.", 401));

  const accessToken = signAccessToken(user._id);
  sendSuccess(res, { accessToken });
});

// ─── Get Current User (me) ───────────────────────────────────────────────────
export const getMe = catchAsync(async (req, res) => {
  const membership = await Membership.findOne({
    user: req.user._id,
    status: { $in: ["active", "renewal_due", "pending_verification"] },
  })
    .sort({ createdAt: -1 })
    .populate("plan");

  sendSuccess(res, { user: req.user.toSafeJSON(), membership: membership || null });
});

// ─── Change Password ─────────────────────────────────────────────────────────
export const changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return next(createError("Current and new passwords are required.", 400));
  }

  const user = await User.findById(req.user._id).select("+password");
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) return next(createError("Current password is incorrect.", 401));

  if (newPassword.length < 6) {
    return next(createError("New password must be at least 6 characters.", 400));
  }

  user.password = newPassword;
  await user.save();

  sendSuccess(res, null, 200, "Password changed successfully.");
});

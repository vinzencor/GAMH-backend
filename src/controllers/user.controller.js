import User from "../models/User.js";
import Notification from "../models/Notification.js";
import RoleModuleAccess from "../models/RoleModuleAccess.js";
import { sendEmail } from "../utils/email.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";
import { ROLES, MODULE_KEYS } from "../config/constants.js";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

// ─── Get profile ─────────────────────────────────────────────────────────────
export const getProfile = catchAsync(async (req, res) => {
  const userId = req.params.id || req.user._id;
  const user = await User.findById(userId).select("-password");
  if (!user) throw createError("User not found.", 404);
  sendSuccess(res, user.toSafeJSON());
});

// ─── Update own profile ───────────────────────────────────────────────────────
export const updateProfile = catchAsync(async (req, res, next) => {
  const { fullName, institution, bio, socialLinks, photoUrl, reviewerCategory } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) return next(createError("User not found.", 404));

  if (fullName !== undefined) user.fullName = fullName;
  if (institution !== undefined) user.institution = institution;
  if (bio !== undefined) user.bio = bio;
  if (reviewerCategory !== undefined) user.reviewerCategory = reviewerCategory;
  if (photoUrl !== undefined) user.photoUrl = photoUrl;
  if (socialLinks !== undefined) {
    user.socialLinks = new Map(Object.entries(socialLinks));
  }

  await user.save();
  sendSuccess(res, user.toSafeJSON(), 200, "Profile updated.");
});

// ─── Admin: list all users ────────────────────────────────────────────────────
export const listUsers = catchAsync(async (req, res) => {
  const { role, search, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (role) filter.roles = role;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(filter).select("-password").skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
    User.countDocuments(filter),
  ]);

  sendSuccess(res, { users, total, page: Number(page), limit: Number(limit) });
});

// ─── Public: list authors/reviewers (safe fields only, no auth required) ─────
export const listPublicDirectory = catchAsync(async (req, res) => {
  const { role, search, limit = 500 } = req.query;
  const filter = { isActive: true };
  if (role) filter.roles = role;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { institution: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(filter)
    .select("fullName institution bio photoUrl reviewerCategory roles")
    .limit(Number(limit))
    .sort({ fullName: 1 });

  sendSuccess(res, { users });
});

// ─── Admin: assign roles ──────────────────────────────────────────────────────
export const assignRoles = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { roles } = req.body;

  if (!Array.isArray(roles)) return next(createError("roles must be an array.", 400));
  const invalid = roles.filter((r) => !Object.values(ROLES).includes(r));
  if (invalid.length) return next(createError(`Invalid roles: ${invalid.join(", ")}`, 400));

  const user = await User.findByIdAndUpdate(
    userId,
    { roles },
    { new: true, select: "-password" }
  );
  if (!user) return next(createError("User not found.", 404));

  sendSuccess(res, user.toSafeJSON(), 200, "Roles updated.");
});

// ─── Admin: add a single role ─────────────────────────────────────────────────
export const addRole = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { role } = req.body;
  if (!Object.values(ROLES).includes(role)) return next(createError("Invalid role.", 400));

  const user = await User.findByIdAndUpdate(
    userId,
    { $addToSet: { roles: role } },
    { new: true, select: "-password" }
  );
  if (!user) return next(createError("User not found.", 404));
  sendSuccess(res, user.toSafeJSON());
});

// ─── Admin: remove a single role ─────────────────────────────────────────────
export const removeRole = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { role } = req.body;

  const user = await User.findByIdAndUpdate(
    userId,
    { $pull: { roles: role } },
    { new: true, select: "-password" }
  );
  if (!user) return next(createError("User not found.", 404));
  sendSuccess(res, user.toSafeJSON());
});

// ─── Admin: set reviewer category ────────────────────────────────────────────
export const setReviewerCategory = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { reviewerCategory } = req.body;

  const allowed = ["", "our_reviewer", "top_reviewer", "chief_editor"];
  const nextCategory = String(reviewerCategory || "").trim();
  if (!allowed.includes(nextCategory)) {
    return next(createError("Invalid reviewer category.", 400));
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { reviewerCategory: nextCategory },
    { new: true, select: "-password" }
  );
  if (!user) return next(createError("User not found.", 404));

  sendSuccess(res, user.toSafeJSON(), 200, "Reviewer category updated.");
});

// ─── Admin: get / set role-module access ──────────────────────────────────────
export const getRoleModuleAccess = catchAsync(async (req, res) => {
  const records = await RoleModuleAccess.find({});
  sendSuccess(res, records);
});

export const setRoleModuleAccess = catchAsync(async (req, res, next) => {
  const { roleName, moduleKey, canAccess } = req.body;
  if (!Object.values(ROLES).includes(roleName)) return next(createError("Invalid role.", 400));
  if (!MODULE_KEYS.includes(moduleKey)) return next(createError("Invalid module key.", 400));

  const record = await RoleModuleAccess.findOneAndUpdate(
    { roleName, moduleKey },
    { canAccess },
    { upsert: true, new: true }
  );
  sendSuccess(res, record);
});

// ─── Admin: deactivate / activate user ───────────────────────────────────────
export const toggleUserActive = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return next(createError("User not found.", 404));
  user.isActive = !user.isActive;
  await user.save();
  sendSuccess(res, { isActive: user.isActive });
});
// ─── Admin: delete user ──────────────────────────────────────────────────────
export const deleteUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findByIdAndDelete(userId);
  if (!user) return next(createError("User not found.", 404));
  sendSuccess(res, null, 200, "User permanently deleted.");
});

export const updateUserAccount = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { email, password } = req.body;

  const user = await User.findById(userId).select("+password");
  if (!user) return next(createError("User not found.", 404));

  const originalEmail = normalizeEmail(user.email);

  const nextEmail = email !== undefined ? normalizeEmail(email) : normalizeEmail(user.email);
  if (email !== undefined && !nextEmail) {
    return next(createError("Email cannot be empty.", 400));
  }

  if (email !== undefined && nextEmail !== normalizeEmail(user.email)) {
    const conflict = await User.findOne({
      _id: { $ne: user._id },
      $or: [{ email: nextEmail }, { emailHistory: nextEmail }],
    });
    if (conflict) return next(createError("This email is already registered.", 409));

    if (originalEmail && !user.emailHistory.includes(originalEmail)) {
      user.emailHistory.push(originalEmail);
    }
    user.email = nextEmail;
  }

  if (password !== undefined && String(password).trim()) {
    if (String(password).trim().length < 6) {
      return next(createError("Password must be at least 6 characters.", 400));
    }
    user.password = String(password).trim();
  }

  await user.save();

  const notificationMessage = [
    email !== undefined && nextEmail !== originalEmail ? `Your email address has been updated.` : null,
    password !== undefined && String(password).trim() ? "Your password has been updated." : null,
  ].filter(Boolean).join(" ") || "Your account details were updated.";

  await Notification.create({
    recipientUser: user._id,
    type: "support_request_update",
    message: notificationMessage,
    relatedUser: user._id,
  });

  await sendEmail({
    to: user.email,
    subject: "Your GAMH account has been updated",
    text: notificationMessage,
    html: notificationMessage,
  });

  sendSuccess(res, user.toSafeJSON(), 200, "User account updated.");
});

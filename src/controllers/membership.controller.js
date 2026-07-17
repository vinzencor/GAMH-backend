import Membership from "../models/Membership.js";
import MembershipPlan from "../models/MembershipPlan.js";
import Invoice from "../models/Invoice.js";
import PayPerViewPurchase from "../models/PayPerViewPurchase.js";
import ContentItem from "../models/ContentItem.js";
import User from "../models/User.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";
import { reconcileMembershipStatuses, deriveStatus } from "../utils/membership.js";
import { ROLES } from "../config/constants.js";
import { getSignedS3GetUrlFromValue, getUploadedS3Keys } from "../utils/upload.js";

// ─── Plans ────────────────────────────────────────────────────────────────────

export const listPlans = catchAsync(async (req, res) => {
  const plans = await MembershipPlan.find({ isActive: true }).sort({ price: 1 });
  sendSuccess(res, plans);
});

export const createPlan = catchAsync(async (req, res, next) => {
  const { name, description, price, billingPeriod, features } = req.body;
  if (!name || price === undefined) return next(createError("Name and price are required.", 400));
  const plan = await MembershipPlan.create({ name, description, price, billingPeriod, features });
  sendSuccess(res, plan, 201);
});

export const updatePlan = catchAsync(async (req, res, next) => {
  const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!plan) return next(createError("Plan not found.", 404));
  sendSuccess(res, plan);
});

export const deletePlan = catchAsync(async (req, res, next) => {
  const plan = await MembershipPlan.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!plan) return next(createError("Plan not found.", 404));
  sendSuccess(res, null, 200, "Plan deactivated.");
});

// ─── User Membership ──────────────────────────────────────────────────────────

export const getMyMembership = catchAsync(async (req, res) => {
  await reconcileMembershipStatuses(req.user._id);

  const membership = await Membership.findOne({
    user: req.user._id,
    status: { $in: ["active", "renewal_due", "pending_verification", "pending"] },
  })
    .sort({ createdAt: -1 })
    .populate("plan");

  if (!membership) {
    sendSuccess(res, null);
    return;
  }

  const response = membership.toObject();
  response.screenshotSignedUrl = await getSignedS3GetUrlFromValue(response.screenshotUrl);
  sendSuccess(res, response);
});

export const applyMembership = catchAsync(async (req, res, next) => {
  const { planId } = req.body;
  if (!planId) return next(createError("planId is required.", 400));

  const plan = await MembershipPlan.findById(planId);
  if (!plan || !plan.isActive) return next(createError("Plan not found or inactive.", 404));

  // Cancel existing pending memberships
  await Membership.updateMany(
    { user: req.user._id, status: { $in: ["pending_verification", "pending"] } },
    { status: "cancelled", cancelledAt: new Date() }
  );

  // Handle screenshot upload
  const screenshotUrl = req.file
    ? req.file.s3Url
    : "";

  const membership = await Membership.create({
    user: req.user._id,
    plan: planId,
    status: "pending_verification",
    screenshotUrl,
    startsAt: new Date(),
  });

  // Create invoice
  await Invoice.create({
    user: req.user._id,
    membership: membership._id,
    amount: plan.price,
    currency: "INR",
    status: "unpaid",
  });

  const response = membership.toObject();
  response.screenshotSignedUrl = await getSignedS3GetUrlFromValue(response.screenshotUrl);
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 201, "Membership application submitted. Awaiting verification.");
});

export const cancelMembership = catchAsync(async (req, res, next) => {
  const membership = await Membership.findOne({
    user: req.user._id,
    status: { $in: ["active", "renewal_due"] },
  });
  if (!membership) return next(createError("No active membership found.", 404));

  membership.status = "cancelled";
  membership.cancelledAt = new Date();
  await membership.save();

  // Remove member/subscriber roles
  await User.findByIdAndUpdate(req.user._id, {
    $pull: { roles: { $in: [ROLES.MEMBER, ROLES.SUBSCRIBER] } },
  });

  sendSuccess(res, null, 200, "Membership cancelled.");
});

// ─── Admin: list all memberships ──────────────────────────────────────────────

export const listMemberships = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [memberships, total] = await Promise.all([
    Membership.find(filter)
      .populate("user", "fullName email institution")
      .populate("plan", "name price billingPeriod")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Membership.countDocuments(filter),
  ]);

  const enrichedMemberships = await Promise.all(
    memberships.map(async (membership) => {
      const obj = membership.toObject();
      obj.screenshotSignedUrl = await getSignedS3GetUrlFromValue(obj.screenshotUrl);
      return obj;
    })
  );

  sendSuccess(res, { memberships: enrichedMemberships, total, page: Number(page) });
});

// ─── Admin: approve / reject membership ──────────────────────────────────────

export const adminApproveMembership = catchAsync(async (req, res, next) => {
  const { membershipId } = req.params;
  const { approve, durationMonths = 12 } = req.body;

  const membership = await Membership.findById(membershipId).populate("plan");
  if (!membership) return next(createError("Membership not found.", 404));

  if (approve) {
    const starts = new Date();
    const ends = new Date(starts);
    ends.setMonth(ends.getMonth() + Number(durationMonths));

    membership.status = "active";
    membership.startsAt = starts;
    membership.endsAt = ends;
    await membership.save();

    // Mark invoice as paid
    await Invoice.findOneAndUpdate(
      { membership: membershipId, status: "unpaid" },
      { status: "paid", paidAt: new Date() }
    );

    // Grant member role
    await User.findByIdAndUpdate(membership.user, {
      $addToSet: { roles: ROLES.MEMBER },
    });

    sendSuccess(res, membership, 200, "Membership approved.");
  } else {
    membership.status = "cancelled";
    membership.cancelledAt = new Date();
    await membership.save();

    sendSuccess(res, membership, 200, "Membership rejected.");
  }
});

// ─── Admin: renew membership ──────────────────────────────────────────────────

export const adminRenewMembership = catchAsync(async (req, res, next) => {
  const membership = await Membership.findById(req.params.membershipId).populate("plan");
  if (!membership) return next(createError("Membership not found.", 404));

  const base = membership.endsAt || new Date();
  const newEnd = new Date(base);
  newEnd.setMonth(newEnd.getMonth() + 12);

  membership.endsAt = newEnd;
  membership.status = deriveStatus(newEnd);
  membership.renewedAt = new Date();
  await membership.save();

  sendSuccess(res, membership);
});

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const getMyInvoices = catchAsync(async (req, res) => {
  const invoices = await Invoice.find({ user: req.user._id })
    .populate({ path: "membership", populate: { path: "plan", select: "name price billingPeriod" } })
    .populate("journal", "title slug")
    .sort({ createdAt: -1 });
  sendSuccess(res, invoices);
});

export const listAllInvoices = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate("user", "fullName email")
      .populate({ path: "membership", populate: { path: "plan", select: "name price billingPeriod" } })
      .populate("journal", "title slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Invoice.countDocuments(filter),
  ]);
  sendSuccess(res, { invoices, total });
});

// ─── Pay-Per-View ─────────────────────────────────────────────────────────────

export const checkPPVAccess = catchAsync(async (req, res) => {
  const { contentId } = req.params;
  const purchase = await PayPerViewPurchase.findOne({
    user: req.user._id,
    content: contentId,
  });
  sendSuccess(res, { hasPurchased: !!purchase, purchase: purchase || null });
});

export const purchasePPV = catchAsync(async (req, res, next) => {
  const { contentId } = req.body;
  const content = await ContentItem.findById(contentId);
  if (!content) return next(createError("Content not found.", 404));
  if (content.accessMode !== "pay_per_view") {
    return next(createError("This content is not pay-per-view.", 400));
  }

  const existing = await PayPerViewPurchase.findOne({
    user: req.user._id,
    content: contentId,
  });
  if (existing) return next(createError("Already purchased.", 409));

  const invoice = await Invoice.create({
    user: req.user._id,
    amount: content.ppvPrice,
    currency: "INR",
    status: "paid",
    paidAt: new Date(),
  });

  const purchase = await PayPerViewPurchase.create({
    user: req.user._id,
    content: contentId,
    invoice: invoice._id,
    amount: content.ppvPrice,
    currency: "INR",
  });

  sendSuccess(res, purchase, 201, "Purchase successful.");
});

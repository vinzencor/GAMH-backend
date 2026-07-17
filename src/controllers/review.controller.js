import Review from "../models/Review.js";
import ReviewDecision from "../models/ReviewDecision.js";
import ContentItem from "../models/ContentItem.js";
import JournalSubmission from "../models/JournalSubmission.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";

const normalizeTarget = async ({ contentId, paperId, journalId }) => {
  const targetId = paperId || journalId || contentId;
  if (!targetId) {
    throw createError("paperId or contentId is required.", 400);
  }

  const paper = await JournalSubmission.findById(targetId);
  if (paper) return { target: paper, contentModel: "JournalSubmission" };

  const content = await ContentItem.findById(targetId);
  if (content) return { target: content, contentModel: "ContentItem" };

  throw createError("Paper not found.", 404);
};

// ─── Reviewer: get my assigned reviews ───────────────────────────────────────
export const getMyReviews = catchAsync(async (req, res) => {
  const reviews = await Review.find({ reviewerUser: req.user._id })
    .populate({
      path: "content",
      select: "title summary abstract type status authorUser keywords coAuthors originalAuthorName manuscriptUrl publishDate",
      populate: { path: "authorUser", select: "fullName email" },
    })
    .sort({ createdAt: -1 });
  sendSuccess(res, reviews);
});

// ─── Reviewer: accept a review ───────────────────────────────────────────────
export const acceptReview = catchAsync(async (req, res, next) => {
  const review = await Review.findOne({
    _id: req.params.id,
    reviewerUser: req.user._id,
    status: "assigned",
  });
  if (!review) return next(createError("Review not found or not assignable.", 404));

  review.status = "accepted";
  review.selectedAt = new Date();
  await review.save();

  if (review.selectionGroupId) {
    await Review.updateMany(
      {
        _id: { $ne: review._id },
        reviewerUser: req.user._id,
        selectionGroupId: review.selectionGroupId,
        status: "assigned",
      },
      { $set: { status: "declined" } }
    );
  }

  sendSuccess(res, review);
});

// ─── Reviewer: decline a review ──────────────────────────────────────────────
export const declineReview = catchAsync(async (req, res, next) => {
  const review = await Review.findOne({
    _id: req.params.id,
    reviewerUser: req.user._id,
    status: { $in: ["assigned", "accepted"] },
  });
  if (!review) return next(createError("Review not found.", 404));

  review.status = "declined";
  await review.save();
  sendSuccess(res, review);
});

// ─── Reviewer: submit review ──────────────────────────────────────────────────
export const submitReview = catchAsync(async (req, res, next) => {
  const { recommendation, commentsToEditor, commentsToAuthor } = req.body;

  const review = await Review.findOne({
    _id: req.params.id,
    reviewerUser: req.user._id,
    status: "accepted",
  });
  if (!review) return next(createError("Review not found or not in accepted state.", 404));

  if (!recommendation) return next(createError("Recommendation is required.", 400));

  review.recommendation = recommendation;
  review.commentsToEditor = commentsToEditor || "";
  review.commentsToAuthor = commentsToAuthor || "";
  review.status = "submitted";
  review.submittedAt = new Date();
  await review.save();

  sendSuccess(res, review, 200, "Review submitted.");
});

// ─── Admin: assign reviewer to content ───────────────────────────────────────
export const assignReviewer = catchAsync(async (req, res, next) => {
  const { reviewerUserId, dueDate } = req.body;

  const { target, contentModel } = await normalizeTarget(req.body);

  if (contentModel === "JournalSubmission") {
    return next(
      createError(
        "Papers can only be assigned to a Workflow, not directly to a reviewer. Assign a Workflow Template to this paper instead (PATCH /api/journals/:id with workflowTemplate).",
        400
      )
    );
  }

  // Check if already assigned
  const existing = await Review.findOne({
    content: target._id,
    contentModel,
    reviewerUser: reviewerUserId,
    status: { $nin: ["declined"] },
  });
  if (existing) return next(createError("Reviewer already assigned to this paper.", 409));

  const review = await Review.create({
    content: target._id,
    contentModel,
    reviewerUser: reviewerUserId,
    assignedByUser: req.user._id,
    dueDate: dueDate || null,
    status: "assigned",
    assignmentMode: "single",
  });

  sendSuccess(res, review, 201, "Reviewer assigned.");
});

// ─── Removed: direct paper-bucket-to-reviewer assignment ────────────────────
// Papers (JournalSubmissions) are assigned to a Workflow only — see
// journal.controller.js `updateJournal` (workflowTemplate field) and the
// Paper Review Queue UI (AdminReviews.tsx "Assign Workflow"). This endpoint
// is kept as a stub returning 410 Gone in case any old client still calls it.
export const assignReviewerBucket = catchAsync(async (req, res, next) => {
  return next(
    createError(
      "Direct paper-to-reviewer assignment has been removed. Assign a Workflow Template to the paper instead — the workflow's stage assignee (reviewer or sub admin) will receive it automatically.",
      410
    )
  );
});

// ─── Reviewer: select one paper from bucket ──────────────────────────────────
export const selectReviewPaper = catchAsync(async (req, res, next) => {
  const review = await Review.findOne({
    _id: req.params.id,
    reviewerUser: req.user._id,
    status: "assigned",
  });
  if (!review) return next(createError("Review not found or not selectable.", 404));

  review.status = "accepted";
  review.selectedAt = new Date();
  await review.save();

  if (review.selectionGroupId) {
    await Review.updateMany(
      {
        _id: { $ne: review._id },
        reviewerUser: req.user._id,
        selectionGroupId: review.selectionGroupId,
        status: "assigned",
      },
      { $set: { status: "declined" } }
    );
  }

  sendSuccess(res, review, 200, "Paper selected for review.");
});

// ─── Admin: list all reviews ──────────────────────────────────────────────────
export const listReviews = catchAsync(async (req, res) => {
  const { contentId, paperId, status } = req.query;
  const filter = {};
  if (paperId || contentId) filter.content = paperId || contentId;
  if (status) filter.status = status;

  const reviews = await Review.find(filter)
    .populate({
      path: "content",
      select: "title type status abstract summary authorUser keywords coAuthors originalAuthorName manuscriptUrl publishDate",
      populate: { path: "authorUser", select: "fullName email" },
    })
    .populate("reviewerUser", "fullName email")
    .populate("assignedByUser", "fullName")
    .sort({ createdAt: -1 });

  sendSuccess(res, reviews);
});

// ─── Admin: record editorial decision ────────────────────────────────────────
export const recordDecision = catchAsync(async (req, res, next) => {
  const { contentId, decision, decisionNotes } = req.body;

  const VALID = ["approved", "rejected", "changes_requested"];
  if (!VALID.includes(decision)) return next(createError(`Decision must be one of: ${VALID.join(", ")}`, 400));

  const content = await ContentItem.findById(contentId);
  if (!content) return next(createError("Content not found.", 404));

  const dec = await ReviewDecision.create({
    content: contentId,
    decidedByUser: req.user._id,
    decision,
    decisionNotes: decisionNotes || "",
  });

  // Apply decision to content
  const statusMap = {
    approved: { status: "approved", workflowStatus: "approved" },
    rejected: { status: "archived", workflowStatus: "rejected" },
    changes_requested: { status: "in_review", workflowStatus: "changes_requested" },
  };
  await ContentItem.findByIdAndUpdate(contentId, statusMap[decision]);

  sendSuccess(res, dec, 201, "Decision recorded.");
});

import JournalSubmission from "../models/JournalSubmission.js";
import WorkflowTemplate from "../models/WorkflowTemplate.js";
import WorkflowStage from "../models/WorkflowStage.js";
import WorkflowLog from "../models/WorkflowLog.js";
import Notification from "../models/Notification.js";
import Invoice from "../models/Invoice.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";
import { getUploadedS3Keys } from "../utils/upload.js";

const parseMaybeArray = (value) => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [trimmed];
    } catch {
      return trimmed
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
  }
  return [value];
};

const resolveUploadedUrls = (files = {}) => ({
  manuscriptUrl: files.manuscript?.[0]
    ? files.manuscript[0].s3Url
    : undefined,
  supplementaryFileUrl: files.supplementary?.[0]
    ? files.supplementary[0].s3Url
    : undefined,
  coverImageUrl: files.coverImage?.[0]
    ? files.coverImage[0].s3Url
    : undefined,
  paymentProofUrl: files.paymentProof?.[0]
    ? files.paymentProof[0].s3Url
    : undefined,
});

export const createJournalDraft = catchAsync(async (req, res, next) => {
  const { title, abstract, body, institution, workflowTemplateId } = req.body;
  if (!title) return next(createError("Title is required.", 400));

  let workflowTemplate = null;
  if (workflowTemplateId) {
    workflowTemplate = await WorkflowTemplate.findById(workflowTemplateId);
    if (!workflowTemplate) return next(createError("Workflow template not found.", 404));
  } else {
    workflowTemplate = await WorkflowTemplate.findOne({ isActive: true });
  }

  const { manuscriptUrl, supplementaryFileUrl, coverImageUrl, paymentProofUrl } = resolveUploadedUrls(req.files);

  const journal = await JournalSubmission.create({
    title,
    abstract,
    body,
    institution: institution || req.user.institution || "",
    manuscriptUrl: manuscriptUrl || "",
    supplementaryFileUrl: supplementaryFileUrl || "",
    coverImageUrl: coverImageUrl || "",
    keywords: parseMaybeArray(req.body.keywords) || [],
    coAuthors: parseMaybeArray(req.body.coAuthors) || [],
    status: "draft",
    authorUser: req.user._id,
    workflowTemplate: workflowTemplate?._id || null,
    createdBy: req.user._id,
    paymentProofUrl: paymentProofUrl || "",
    paymentAmount: req.body.paymentAmount ? Number(req.body.paymentAmount) : 0,
    paymentStatus: paymentProofUrl ? "awaiting_verification" : "unpaid",
  });

  const response = journal.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 201, "Journal draft created.");
});

export const submitJournal = catchAsync(async (req, res, next) => {
  const { title, abstract, body, institution, workflowTemplateId } = req.body;
  if (!title) return next(createError("Title is required.", 400));

  let workflowTemplate = null;
  if (workflowTemplateId) {
    workflowTemplate = await WorkflowTemplate.findById(workflowTemplateId);
    if (!workflowTemplate) return next(createError("Workflow template not found.", 404));
  } else {
    workflowTemplate = await WorkflowTemplate.findOne({ isActive: true });
  }

  const { manuscriptUrl, supplementaryFileUrl, coverImageUrl, paymentProofUrl } = resolveUploadedUrls(req.files);
  if (!manuscriptUrl) {
    return next(createError("Manuscript file is required for journal submission.", 400));
  }
  if (!paymentProofUrl) {
    return next(createError("Payment proof is required before submitting your paper for review. Please upload proof of payment for the submission fee.", 400));
  }

  const journal = await JournalSubmission.create({
    title,
    abstract,
    body,
    institution: institution || req.user.institution || "",
    manuscriptUrl,
    supplementaryFileUrl: supplementaryFileUrl || "",
    coverImageUrl: coverImageUrl || "",
    keywords: parseMaybeArray(req.body.keywords) || [],
    coAuthors: parseMaybeArray(req.body.coAuthors) || [],
    status: "submitted",
    authorUser: req.user._id,
    workflowTemplate: workflowTemplate?._id || null,
    createdBy: req.user._id,
    paymentProofUrl,
    paymentAmount: req.body.paymentAmount ? Number(req.body.paymentAmount) : 0,
    paymentStatus: "awaiting_verification",
  });

  const response = journal.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 201, "Journal submitted for review.");
});

export const listMyJournals = catchAsync(async (req, res) => {
  const journals = await JournalSubmission.find({ authorUser: req.user._id })
    .sort({ createdAt: -1 });
  sendSuccess(res, journals);
});

export const updateJournal = catchAsync(async (req, res, next) => {
  const journal = await JournalSubmission.findById(req.params.id);
  if (!journal) return next(createError("Journal submission not found.", 404));

  const isOwner = journal.authorUser.toString() === req.user._id.toString();
  const isAdmin = req.user.hasAnyRole(["super_admin", "content_admin", "editor"]);
  if (!isOwner && !isAdmin) return next(createError("Forbidden.", 403));

  const previousWorkflowTemplate = String(journal.workflowTemplate || "");
  const previousStatus = journal.status;

  const updatable = ["title", "abstract", "body", "institution", "status", "workflowTemplate", "originalAuthorName", "accessMode", "reviewerComment"];
  updatable.forEach((field) => {
    if (req.body[field] !== undefined) {
      journal[field] = req.body[field];
    }
  });

  // Super admin's decision on a reviewer's change request: a reviewer's
  // "changes requested" no longer goes straight to the author — it lands
  // here first (status "changes_requested_awaiting_admin"). The admin either
  // approves it (forwarded to the author, same as today's changes_requested
  // flow) or declines it (bounced back to the SAME reviewer/stage instead).
  // Uses a dedicated field rather than overloading `status` so this can't be
  // triggered accidentally by an unrelated status edit.
  if (req.body.changeRequestDecision && previousStatus === "changes_requested_awaiting_admin") {
    const decidedBy = req.user.fullName || req.user.email || "Super Admin";
    if (req.body.changeRequestDecision === "approve") {
      journal.status = "changes_requested";
      // reviewerComment / returnToStageIndex are already set by the reviewer.

      await Notification.create({
        recipientRole: null,
        recipientUser: journal.authorUser,
        type: "journal_changes_forwarded",
        message: `Your paper "${journal.title}" needs revisions.${journal.reviewerComment ? ` Reviewer feedback: ${journal.reviewerComment}` : ""} Please edit and resubmit.`,
        relatedJournal: journal._id,
      }).catch(() => null); // non-blocking

      await WorkflowLog.create({
        content: journal._id,
        contentModel: "JournalSubmission",
        stageIndex: journal.currentStageIndex,
        action: "changes_review_approved",
        comment: `Change request approved and forwarded to the author by ${decidedBy}.`,
        actedBy: req.user._id,
      }).catch(() => null);
    } else if (req.body.changeRequestDecision === "decline") {
      // Same stage, same reviewer — just reopen it in their queue.
      journal.status = "in_review";
      journal.reviewerComment = "";
      journal.returnToStageIndex = null;

      await WorkflowLog.create({
        content: journal._id,
        contentModel: "JournalSubmission",
        stageIndex: journal.currentStageIndex,
        action: "changes_review_declined",
        comment: `Change request declined by ${decidedBy} — returned to the same reviewer for further review.`,
        actedBy: req.user._id,
      }).catch(() => null);
    }
  }

  // Final-gate rejection: super admin rejecting a paper that has already
  // cleared every review stage ("accepted") does not terminally kill it —
  // it goes back to the author to edit and resubmit, reusing the existing
  // changes_requested / reviewerComment mechanism. A direct reject of any
  // other (non-accepted) status is a genuine terminal admin rejection and
  // keeps today's behavior.
  if (req.body.status === "rejected" && previousStatus === "accepted") {
    journal.status = "changes_requested";
    journal.reviewerComment = req.body.reviewerComment || "";
    journal.returnToStageIndex = null;

    await Notification.create({
      recipientRole: null,
      recipientUser: journal.authorUser,
      type: "journal_final_rejected",
      message: `Your paper "${journal.title}" was rejected by the super admin at final review.${journal.reviewerComment ? ` Reason: ${journal.reviewerComment}` : ""} Please review the feedback, edit, and resubmit.`,
      relatedJournal: journal._id,
    }).catch(() => null); // non-blocking
  }

  if (req.body.ppvPrice !== undefined) {
    journal.ppvPrice = Number(req.body.ppvPrice) || 0;
  }

  // Sent as a multipart form field (string "true"/"false"), not a real
  // boolean — a truthy-string check here would make every value featured.
  if (req.body.featured !== undefined) {
    journal.featured = req.body.featured === true || req.body.featured === "true";
  }

  // Assigning/reassigning a workflow always restarts the paper at stage 0 of
  // that workflow — currentStageIndex from a previous (different) workflow
  // would otherwise point at the wrong stage, or none at all. This must fire
  // even when re-picking the SAME workflow template (e.g. re-running it after
  // a rejection) — the admin's "Assign Workflow" dialog always submits
  // workflowTemplate, whether or not the value actually changed, and a
  // rejected-pending-reassignment paper must be revived either way.
  let didReassignWorkflow = false;
  if (req.body.workflowTemplate !== undefined) {
    const templateChanged = String(req.body.workflowTemplate || "") !== previousWorkflowTemplate;
    const wasPendingReassignment = previousStatus === "rejected_pending_reassignment";
    if (templateChanged || wasPendingReassignment) {
      journal.currentStageIndex = 0;
      journal.returnToStageIndex = null;
      didReassignWorkflow = true;
    }
    // A paper a reviewer rejected mid-workflow is waiting on the super admin
    // to reassign it — reassigning must bring it back into the active queue
    // (visible to the new stage-1 reviewer) instead of staying stuck.
    if (wasPendingReassignment) {
      journal.status = "submitted";
    }
  }

  if (req.body.publishDate !== undefined) {
    journal.publishDate = req.body.publishDate ? new Date(req.body.publishDate) : null;
  }

  if (req.body.keywords !== undefined) {
    journal.keywords = parseMaybeArray(req.body.keywords) || [];
  }
  if (req.body.coAuthors !== undefined) {
    journal.coAuthors = parseMaybeArray(req.body.coAuthors) || [];
  }

  const { manuscriptUrl, supplementaryFileUrl, coverImageUrl, paymentProofUrl } = resolveUploadedUrls(req.files);
  if (manuscriptUrl) journal.manuscriptUrl = manuscriptUrl;
  if (supplementaryFileUrl) journal.supplementaryFileUrl = supplementaryFileUrl;
  if (coverImageUrl) journal.coverImageUrl = coverImageUrl;
  if (paymentProofUrl) {
    journal.paymentProofUrl = paymentProofUrl;
    // Re-uploading proof always re-queues it for admin verification, even if
    // a prior proof had already been verified/rejected.
    journal.paymentStatus = "awaiting_verification";
  }
  if (req.body.paymentAmount !== undefined) {
    journal.paymentAmount = Number(req.body.paymentAmount) || 0;
  }

  journal.updatedBy = req.user._id;
  await journal.save();

  // So the reassignment itself shows up in the Review History timeline —
  // otherwise the timeline jumps straight from "Rejected" to whatever the
  // new stage-1 reviewer does next, with no record of who reassigned it.
  if (didReassignWorkflow) {
    const workflowName = (await WorkflowTemplate.findById(journal.workflowTemplate).select("name"))?.name || "a workflow";
    await WorkflowLog.create({
      content: journal._id,
      contentModel: "JournalSubmission",
      stageIndex: 0,
      action: "reassigned",
      comment: `Reassigned to workflow "${workflowName}" by ${req.user.fullName || req.user.email || "Super Admin"}.`,
      actedBy: req.user._id,
    }).catch(() => null); // non-blocking
  }

  const response = journal.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 200, "Journal updated.");
});

export const submitDraftJournal = catchAsync(async (req, res, next) => {
  const journal = await JournalSubmission.findById(req.params.id);
  if (!journal) return next(createError("Journal submission not found.", 404));

  if (journal.authorUser.toString() !== req.user._id.toString()) {
    return next(createError("Forbidden.", 403));
  }

  if (!["draft", "changes_requested"].includes(journal.status)) {
    return next(createError("This journal cannot be submitted in its current state.", 400));
  }

  const { manuscriptUrl, supplementaryFileUrl, paymentProofUrl } = resolveUploadedUrls(req.files);
  if (manuscriptUrl) journal.manuscriptUrl = manuscriptUrl;
  if (supplementaryFileUrl) journal.supplementaryFileUrl = supplementaryFileUrl;
  if (paymentProofUrl) {
    journal.paymentProofUrl = paymentProofUrl;
    journal.paymentStatus = "awaiting_verification";
  }
  if (req.body.paymentAmount !== undefined) {
    journal.paymentAmount = Number(req.body.paymentAmount) || 0;
  }

  if (!journal.manuscriptUrl) {
    return next(createError("Manuscript file is required before submitting.", 400));
  }
  if (!journal.paymentProofUrl) {
    return next(createError("Payment proof is required before submitting your paper for review. Please upload proof of payment for the submission fee.", 400));
  }

  if (req.body.title) journal.title = req.body.title;
  if (req.body.abstract !== undefined) journal.abstract = req.body.abstract;
  if (req.body.body !== undefined) journal.body = req.body.body;
  if (req.body.keywords !== undefined) {
    journal.keywords = parseMaybeArray(req.body.keywords) || [];
  }
  if (req.body.coAuthors !== undefined) {
    journal.coAuthors = parseMaybeArray(req.body.coAuthors) || [];
  }

  // If resubmitting after changes_requested, go back to the reviewer stage
  if (journal.returnToStageIndex !== null && journal.returnToStageIndex !== undefined) {
    journal.currentStageIndex = journal.returnToStageIndex;
    journal.returnToStageIndex = null;
  }

  journal.status = "submitted";
  journal.reviewerComment = ""; // Clear old feedback
  journal.updatedBy = req.user._id;
  await journal.save();

  const response = journal.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 200, "Journal resubmitted for review.");
});

export const adminUploadJournal = catchAsync(async (req, res, next) => {
  const { title, abstract, body, institution, workflowTemplateId, originalAuthorName, publishDate } = req.body;
  if (!title) return next(createError("Title is required.", 400));
  if (!originalAuthorName) return next(createError("Author name is required.", 400));

  const { manuscriptUrl, supplementaryFileUrl, coverImageUrl } = resolveUploadedUrls(req.files);
  if (!manuscriptUrl) {
    return next(createError("PDF manuscript file is required.", 400));
  }

  let workflowTemplate = null;
  if (workflowTemplateId) {
    workflowTemplate = await WorkflowTemplate.findById(workflowTemplateId);
    if (!workflowTemplate) return next(createError("Workflow template not found.", 404));
  } else {
    workflowTemplate = await WorkflowTemplate.findOne({ isActive: true });
  }

  const journal = await JournalSubmission.create({
    title,
    abstract: abstract || "",
    body: body || "",
    originalAuthorName,
    institution: institution || "",
    manuscriptUrl,
    supplementaryFileUrl: supplementaryFileUrl || "",
    coverImageUrl: coverImageUrl || "",
    keywords: parseMaybeArray(req.body.keywords) || [],
    coAuthors: parseMaybeArray(req.body.coAuthors) || [],
    status: "submitted",
    authorUser: req.user._id,
    publishDate: publishDate ? new Date(publishDate) : null,
    uploadedBySuperAdmin: true,
    workflowTemplate: workflowTemplate?._id || null,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  const response = journal.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 201, "Paper uploaded by super admin.");
});


export const getFeaturedJournals = catchAsync(async (req, res) => {
  const items = await JournalSubmission.find({ featured: true })
    .populate("authorUser", "fullName institution photoUrl")
    .sort({ updatedAt: -1 })
    .limit(6);
  sendSuccess(res, { items });
});

export const listPublishedJournals = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const filter = { status: "published" };
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { abstract: { $regex: search, $options: "i" } },
      { keywords: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    JournalSubmission.find(filter)
      .populate("authorUser", "fullName institution photoUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    JournalSubmission.countDocuments(filter),
  ]);

  sendSuccess(res, { items, total, page: Number(page), limit: Number(limit) });
});

export const getJournalBySlug = catchAsync(async (req, res, next) => {
  const item = await JournalSubmission.findOne({
    slug: req.params.slug,
    status: "published",
  }).populate("authorUser", "fullName institution photoUrl bio");

  if (!item) return next(createError("Journal not found.", 404));

  item.viewCount += 1;
  await item.save();

  sendSuccess(res, item);
});

export const listAllJournals = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [rawItems, total] = await Promise.all([
    JournalSubmission.find(filter)
      .populate("authorUser", "fullName email institution")
      .populate("workflowTemplate", "name")
      .populate("paymentVerifiedBy", "fullName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    JournalSubmission.countDocuments(filter),
  ]);

  // Enhance items with stage counts
  const items = await Promise.all(rawItems.map(async (item) => {
    const obj = item.toObject();
    if (obj.workflowTemplate) {
      const stageCount = await WorkflowStage.countDocuments({ template: obj.workflowTemplate._id });
      obj.totalStages = stageCount;
    } else {
      obj.totalStages = 0;
    }
    return obj;
  }));

  sendSuccess(res, { items, total, page: Number(page), limit: Number(limit) });
});

export const deleteJournal = catchAsync(async (req, res, next) => {
  const item = await JournalSubmission.findByIdAndDelete(req.params.id);
  if (!item) return next(createError("Journal submission not found.", 404));
  sendSuccess(res, null, 200, "Journal deleted.");
});

export const verifyJournalPayment = catchAsync(async (req, res, next) => {
  const { approve, reason } = req.body; // true = mark paid, false = reject back to unpaid
  const journal = await JournalSubmission.findById(req.params.id);
  if (!journal) return next(createError("Journal submission not found.", 404));

  if (journal.paymentStatus !== "awaiting_verification") {
    return next(
      createError(
        `This payment is not awaiting verification (current status: ${journal.paymentStatus}). It may have already been actioned by another admin.`,
        409
      )
    );
  }

  const isApprove = approve === true || approve === "true";

  if (isApprove) {
    journal.paymentStatus = "paid";
    journal.paymentVerifiedAt = new Date();
    journal.paymentVerifiedBy = req.user._id;
    journal.paymentRejectionReason = "";

    // Invoice is only created once the payment is verified — this is what
    // makes the journal fee show up in the author's billing history and in
    // the admin payment reports, so it must never be created earlier.
    await Invoice.create({
      user: journal.authorUser,
      journal: journal._id,
      type: "journal",
      amount: journal.paymentAmount || 0,
      currency: "INR",
      status: "paid",
      paidAt: journal.paymentVerifiedAt,
    });
  } else {
    journal.paymentStatus = "unpaid";
    journal.paymentVerifiedAt = null;
    journal.paymentVerifiedBy = null;
    journal.paymentRejectionReason = (reason || "").trim();
  }
  journal.updatedBy = req.user._id;
  await journal.save();

  // Notify the author so they actually find out — they otherwise have no
  // way to know their payment proof was rejected until they happen to check.
  if (journal.authorUser) {
    const trimmedReason = (reason || "").trim();
    await Notification.create({
      recipientRole: null,
      recipientUser: journal.authorUser,
      type: isApprove ? "payment_approved" : "payment_rejected",
      message: isApprove
        ? `Your payment for "${journal.title}" has been verified and approved.`
        : `Your payment proof for "${journal.title}" was rejected.${trimmedReason ? ` Note from admin: ${trimmedReason}` : " Please re-upload a valid payment proof."}`,
      relatedJournal: journal._id,
    });
  }

  const populated = await journal.populate("paymentVerifiedBy", "fullName email");
  sendSuccess(res, populated, 200, `Payment ${isApprove ? "approved" : "rejected"}.`);
});

export const withdrawJournal = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return next(createError("A withdrawal reason is required.", 400));
  }

  const journal = await JournalSubmission.findById(req.params.id);
  if (!journal) return next(createError("Journal submission not found.", 404));

  if (journal.authorUser.toString() !== req.user._id.toString()) {
    return next(createError("Forbidden.", 403));
  }

  const nonWithdrawable = ["withdrawn", "published", "rejected"];
  if (nonWithdrawable.includes(journal.status)) {
    return next(createError(`Cannot withdraw a journal that is already ${journal.status}.`, 400));
  }

  journal.status = "withdrawn";
  journal.withdrawnAt = new Date();
  journal.withdrawalReason = reason.trim();
  journal.updatedBy = req.user._id;
  await journal.save();

  // Notify super admins
  await Notification.create({
    recipientRole: "super_admin",
    type: "journal_withdrawn",
    message: `${req.user.fullName} has withdrawn their journal: "${journal.title}". Reason: ${reason.trim()}`,
    relatedJournal: journal._id,
    relatedUser: req.user._id,
  });

  sendSuccess(res, journal, 200, "Journal withdrawn successfully.");
});

// ─── Track: record a view or copy event on a journal ─────────────────────────
export const trackJournal = catchAsync(async (req, res, next) => {
  const { type } = req.body; // "view" | "copy"
  if (!["view", "copy"].includes(type)) {
    return next(createError("Invalid tracking type. Use 'view' or 'copy'.", 400));
  }

  const journal = await JournalSubmission.findById(req.params.id);
  if (!journal) return next(createError("Journal not found.", 404));

  if (type === "view") journal.viewCount = (journal.viewCount || 0) + 1;
  if (type === "copy") journal.copyCount = (journal.copyCount || 0) + 1;

  await journal.save({ validateModifiedOnly: true });
  sendSuccess(res, { viewCount: journal.viewCount, copyCount: journal.copyCount });
});
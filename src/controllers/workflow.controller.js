import WorkflowTemplate from "../models/WorkflowTemplate.js";
import WorkflowStage from "../models/WorkflowStage.js";
import WorkflowLog from "../models/WorkflowLog.js";
import ContentItem from "../models/ContentItem.js";
import JournalSubmission from "../models/JournalSubmission.js";
import SubAdminScore from "../models/SubAdminScore.js";
import Notification from "../models/Notification.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";

// ─── Templates ────────────────────────────────────────────────────────────────

export const listTemplates = catchAsync(async (req, res) => {
  const templates = await WorkflowTemplate.find({}).sort({ createdAt: -1 });
  sendSuccess(res, templates);
});

export const createTemplate = catchAsync(async (req, res, next) => {
  const { name } = req.body;
  if (!name) return next(createError("Template name is required.", 400));
  const template = await WorkflowTemplate.create({ name, createdBy: req.user._id });
  sendSuccess(res, template, 201);
});

export const updateTemplate = catchAsync(async (req, res, next) => {
  const template = await WorkflowTemplate.findByIdAndUpdate(
    req.params.id,
    { name: req.body.name, isActive: req.body.isActive },
    { new: true }
  );
  if (!template) return next(createError("Template not found.", 404));
  sendSuccess(res, template);
});

export const deleteTemplate = catchAsync(async (req, res, next) => {
  const t = await WorkflowTemplate.findByIdAndDelete(req.params.id);
  if (!t) return next(createError("Template not found.", 404));
  await WorkflowStage.deleteMany({ template: req.params.id });
  sendSuccess(res, null, 200, "Template deleted.");
});

// ─── Stages ───────────────────────────────────────────────────────────────────

export const getStages = catchAsync(async (req, res) => {
  const stages = await WorkflowStage.find({ template: req.params.templateId })
    .populate("assignedUser", "fullName email")
    .sort({ orderIndex: 1 });
  sendSuccess(res, stages);
});

export const upsertStages = catchAsync(async (req, res, next) => {
  const { templateId } = req.params;
  const { stages } = req.body; // Array of { stageName, orderIndex, assignedUser }
  if (!Array.isArray(stages)) return next(createError("stages must be an array.", 400));

  await WorkflowStage.deleteMany({ template: templateId });
  const docs = stages.map((s) => ({
    template: templateId,
    stageName: s.stageName,
    orderIndex: s.orderIndex,
    assignedUser: s.assignedUser || null,
  }));
  const created = await WorkflowStage.insertMany(docs);
  sendSuccess(res, created);
});

// ─── Sub-admin: get my assigned stage content ─────────────────────────────────

export const getMyQueue = catchAsync(async (req, res) => {
  // Find stages assigned to this user
  const stages = await WorkflowStage.find({ assignedUser: req.user._id });
  if (!stages.length) return sendSuccess(res, []);

  // Build a precise filter: for each stage, match template + orderIndex
  const orConditions = stages.map((s) => ({
    workflowTemplate: s.template,
    currentStageIndex: s.orderIndex,
  }));

  const [articles, journals] = await Promise.all([
    ContentItem.find({
      $or: orConditions,
      workflowStatus: { $in: ["submitted", "in_review"] },
    }).populate("authorUser", "fullName email institution"),
    JournalSubmission.find({
      $or: orConditions,
      status: { $in: ["submitted", "in_review"] },
    }).populate("authorUser", "fullName email institution"),
  ]);

  // Tag them so frontend knows type
  let items = [
    ...articles.map((a) => ({ ...a.toObject(), itemType: "article" })),
    ...journals.map((j) => ({ ...j.toObject(), itemType: "journal" })),
  ];

  // Reviewers must never see who wrote the paper or where they're from —
  // masked here (not just in the UI) so it never appears in the API response.
  const isPureReviewer = !req.user.hasAnyRole(["sub_admin", "super_admin", "editor", "content_admin"]);
  if (isPureReviewer) {
    items = items.map((item) => ({
      ...item,
      authorUser: undefined,
      originalAuthorName: undefined,
      institution: undefined,
      coAuthors: [],
    }));
  }

  sendSuccess(res, items);
});

// ─── Sub-admin: take action on content ───────────────────────────────────────

export const reviewAction = catchAsync(async (req, res, next) => {
  const { contentId } = req.params;
  const { action, comment } = req.body;

  const VALID_ACTIONS = ["approved", "changes_requested", "rejected"];
  if (!VALID_ACTIONS.includes(action)) {
    return next(createError(`Action must be one of: ${VALID_ACTIONS.join(", ")}`, 400));
  }

  // Try finding in ContentItem first, then JournalSubmission
  let item = await ContentItem.findById(contentId).populate("workflowTemplate");
  let isJournal = false;

  if (!item) {
    item = await JournalSubmission.findById(contentId).populate("workflowTemplate");
    if (item) isJournal = true;
  }

  if (!item) return next(createError("Content not found.", 404));

  // Verify sub-admin is assigned to current stage
  const stage = await WorkflowStage.findOne({
    template: item.workflowTemplate?._id || item.workflowTemplate,
    orderIndex: item.currentStageIndex,
    assignedUser: req.user._id,
  });

  if (!stage && !req.user.hasAnyRole(["super_admin", "editor", "content_admin"])) {
    return next(createError("You are not assigned to this stage.", 403));
  }

  // Log the action
  await WorkflowLog.create({
    content: contentId,
    contentModel: isJournal ? "JournalSubmission" : "ContentItem",
    stage: stage?._id,
    stageIndex: item.currentStageIndex,
    action,
    comment: comment || "",
    actedBy: req.user._id,
  });

  if (action === "approved") {
    // Access Mode is set by the admin when assigning the workflow (or later,
    // when publishing) — reviewers can no longer set it here.

    // Count total stages
    const templateId = item.workflowTemplate?._id || item.workflowTemplate;
    const totalStages = await WorkflowStage.countDocuments({ template: templateId });

    if (item.currentStageIndex + 1 >= totalStages) {
      // Final stage – all reviewers have signed off. This does NOT publish
      // the paper: it only marks it as accepted/ready, awaiting the super
      // admin's manual publish action from the admin pipeline.
      item.status = "accepted";
      if (!isJournal) item.workflowStatus = "approved";

      await Notification.create({
        recipientRole: "super_admin",
        type: "journal_ready_to_publish",
        message: `"${item.title || "Untitled"}" has cleared all review stages and is ready to publish.`,
        relatedJournal: item._id,
        relatedUser: req.user._id,
      }).catch(() => null); // non-blocking
    } else {
      item.currentStageIndex += 1;
      if (isJournal) item.status = "in_review";
      else item.workflowStatus = "in_review";
    }
    // Clear any prior change-request info
    if (isJournal) {
      item.returnToStageIndex = null;
      item.reviewerComment = "";
    }
  } else if (action === "changes_requested") {
    if (isJournal) {
      // A reviewer's change request does not go straight to the author — it
      // must be reviewed by the super admin first, who can either forward it
      // to the author or decline it and send the paper back to this same
      // reviewer/stage. currentStageIndex is left untouched so a decline
      // lands right back with this reviewer.
      item.status = "changes_requested_awaiting_admin";
      // Remember which stage sent it back so a forward-to-author resubmission
      // eventually returns here.
      item.returnToStageIndex = item.currentStageIndex;
      item.reviewerComment = comment || "";

      const title = item.title || "Untitled";
      const requestedBy = req.user.fullName || req.user.email || "A reviewer";
      await Notification.create({
        recipientRole: "super_admin",
        type: "journal_changes_requested_review",
        message: `"${title}" — ${requestedBy} requested changes and it needs your review before it goes to the author.`,
        relatedJournal: item._id,
        relatedUser: req.user._id,
      }).catch(() => null); // non-blocking
    } else {
      item.workflowStatus = "changes_requested";
    }
  } else if (action === "rejected") {
    // A reviewer rejection is not terminal for journals — it returns to the
    // super admin for reassignment to a (possibly different) workflow, rather
    // than killing the submission outright. ContentItem rejections are
    // unaffected and remain terminal.
    item.status = isJournal ? "rejected_pending_reassignment" : "archived";
    if (!isJournal) item.workflowStatus = "rejected";

    // Notify super admins of the rejection
    const title = item.title || "Untitled";
    const rejectedBy = req.user.fullName || req.user.email || "A reviewer";
    const noteText = comment ? ` Reason: ${comment}` : "";
    await Notification.create({
      recipientRole: "super_admin",
      type: isJournal ? "journal_rejected_pending_reassignment" : "journal_rejected",
      message: isJournal
        ? `"${title}" was rejected by ${rejectedBy} and needs to be reassigned to a workflow.${noteText}`
        : `"${title}" has been rejected by ${rejectedBy}.${noteText}`,
      relatedJournal: item._id,
      relatedUser: req.user._id,
    }).catch(() => null); // non-blocking
  }

  item.updatedBy = req.user._id;
  await item.save();

  // Update sub-admin score
  await _updateSubAdminScore(req.user._id, action);

  sendSuccess(res, item, 200, "Action recorded.");
});

// ─── Workflow logs for a content item ─────────────────────────────────────────

export const getContentLogs = catchAsync(async (req, res) => {
  const logs = await WorkflowLog.find({ content: req.params.contentId })
    .populate("actedBy", "fullName email")
    .populate("stage", "stageName orderIndex")
    .sort({ actedAt: -1 });
  sendSuccess(res, logs);
});

// Shared: resolve content titles across ContentItem + JournalSubmission for a
// set of raw lean log objects, with self-healing for stale contentModel values.
async function _resolveLogsContent(rawLogs) {
  const contentIds = rawLogs.map((l) => String(l.content));
  const [contentItems, journals] = await Promise.all([
    ContentItem.find({ _id: { $in: contentIds } }).select("title type status"),
    JournalSubmission.find({ _id: { $in: contentIds } }).select("title status"),
  ]);
  const contentItemMap = new Map(contentItems.map((c) => [String(c._id), c]));
  const journalMap = new Map(journals.map((j) => [String(j._id), j]));

  const toHeal = [];
  const logs = rawLogs.map((log) => {
    const id = String(log.content);
    let contentDoc = null;
    let resolvedModel = log.contentModel;

    if (log.contentModel === "JournalSubmission" && journalMap.has(id)) {
      contentDoc = journalMap.get(id);
    } else if (log.contentModel !== "JournalSubmission" && contentItemMap.has(id)) {
      contentDoc = contentItemMap.get(id);
    } else if (journalMap.has(id)) {
      contentDoc = journalMap.get(id);
      resolvedModel = "JournalSubmission";
      toHeal.push(log._id);
    } else if (contentItemMap.has(id)) {
      contentDoc = contentItemMap.get(id);
      resolvedModel = "ContentItem";
    }

    return {
      ...log,
      contentModel: resolvedModel,
      content: contentDoc
        ? { _id: contentDoc._id, title: contentDoc.title, type: contentDoc.type, status: contentDoc.status }
        : null,
    };
  });

  if (toHeal.length) {
    await WorkflowLog.updateMany({ _id: { $in: toHeal } }, { contentModel: "JournalSubmission" }).catch(() => null);
  }
  return logs;
}

// ─── My review history (sub-admin / reviewer) ─────────────────────────────────

export const getMyLogs = catchAsync(async (req, res) => {
  const rawLogs = await WorkflowLog.find({ actedBy: req.user._id })
    .populate("stage", "stageName orderIndex")
    .sort({ actedAt: -1 })
    .limit(500)
    .lean();
  const logs = await _resolveLogsContent(rawLogs);
  sendSuccess(res, logs);
});

// ─── Admin: all workflow logs (super admin analytics) ─────────────────────────

export const getAllLogs = catchAsync(async (req, res) => {
  const rawLogs = await WorkflowLog.find({})
    .populate("stage", "stageName orderIndex")
    .populate("actedBy", "fullName email")
    .sort({ actedAt: -1 })
    .limit(2000)
    .lean();
  const logs = await _resolveLogsContent(rawLogs);
  sendSuccess(res, logs);
});

// ─── Sub-admin score ─────────────────────────────────────────────────────────

export const getMyScore = catchAsync(async (req, res) => {
  const score = await SubAdminScore.findOne({ user: req.user._id });
  sendSuccess(res, score || { totalScore: 0, approvals: 0, changesRequested: 0, rejections: 0 });
});

// Internal helper
async function _updateSubAdminScore(userId, action) {
  const increment = {};
  if (action === "approved") {
    increment.approvals = 1;
    increment.totalScore = 10;
    increment.currentStreak = 1;
  } else if (action === "changes_requested") {
    increment.changesRequested = 1;
    increment.totalScore = 5;
  } else if (action === "rejected") {
    increment.rejections = 1;
    increment.totalScore = 3;
  }

  await SubAdminScore.findOneAndUpdate(
    { user: userId },
    { $inc: increment, $set: { lastActivityAt: new Date() } },
    { upsert: true, new: true }
  );
}

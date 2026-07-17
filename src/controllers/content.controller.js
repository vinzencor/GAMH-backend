import ContentItem from "../models/ContentItem.js";
import WorkflowTemplate from "../models/WorkflowTemplate.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";

// ─── Public: list published content ──────────────────────────────────────────
export const listPublished = catchAsync(async (req, res) => {
  const { type, access, search, page = 1, limit = 20 } = req.query;
  const filter = { status: "published" };
  if (type) filter.type = type;
  if (access) filter.accessMode = access;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { summary: { $regex: search, $options: "i" } },
      { keywords: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    ContentItem.find(filter)
      .populate("authorUser", "fullName institution photoUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ContentItem.countDocuments(filter),
  ]);

  sendSuccess(res, { items, total, page: Number(page), limit: Number(limit) });
});

// ─── Public: get single published item by slug ────────────────────────────────
export const getBySlug = catchAsync(async (req, res, next) => {
  const item = await ContentItem.findOne({
    slug: req.params.slug,
    status: "published",
  }).populate("authorUser", "fullName institution photoUrl bio");

  if (!item) return next(createError("Publication not found.", 404));

  // Increment view count
  item.viewCount += 1;
  await item.save();

  sendSuccess(res, item);
});

// ─── Author: get own submissions ──────────────────────────────────────────────
export const getMySubmissions = catchAsync(async (req, res) => {
  const items = await ContentItem.find({ authorUser: req.user._id })
    .sort({ createdAt: -1 });
  sendSuccess(res, items);
});

// ─── Author: create / save draft ─────────────────────────────────────────────
export const createContent = catchAsync(async (req, res, next) => {
  const { title, summary, body, type, keywords, coAuthors, workflowTemplateId } =
    req.body;

  if (!title) return next(createError("Title is required.", 400));

  // Resolve workflow template
  let workflowTemplate = null;
  if (workflowTemplateId) {
    workflowTemplate = await WorkflowTemplate.findById(workflowTemplateId);
  } else {
    workflowTemplate = await WorkflowTemplate.findOne({ isActive: true });
  }

  const item = await ContentItem.create({
    title,
    summary,
    body,
    type: type || "article",
    keywords: keywords || [],
    coAuthors: coAuthors || [],
    authorUser: req.user._id,
    workflowTemplate: workflowTemplate?._id,
    status: "draft",
    workflowStatus: "draft",
    createdBy: req.user._id,
  });

  sendSuccess(res, item, 201, "Content created.");
});

// ─── Author: submit paper ─────────────────────────────────────────────────────
export const submitPaper = catchAsync(async (req, res, next) => {
  const item = await ContentItem.findById(req.params.id);
  if (!item) return next(createError("Submission not found.", 404));

  if (item.authorUser.toString() !== req.user._id.toString()) {
    return next(createError("Forbidden.", 403));
  }

  if (!["draft", "changes_requested"].includes(item.workflowStatus)) {
    return next(createError("This submission cannot be submitted in its current state.", 400));
  }

  const { title, summary, body, keywords, coAuthors } = req.body;
  if (title) item.title = title;
  if (summary) item.summary = summary;
  if (body) item.body = body;
  if (keywords) item.keywords = keywords;
  if (coAuthors) item.coAuthors = coAuthors;

  item.status = "in_review";
  item.workflowStatus = "submitted";
  await item.save();

  sendSuccess(res, item, 200, "Paper submitted for review.");
});

// ─── Author: update draft ─────────────────────────────────────────────────────
export const updateContent = catchAsync(async (req, res, next) => {
  const item = await ContentItem.findById(req.params.id);
  if (!item) return next(createError("Content not found.", 404));

  const isOwner = item.authorUser.toString() === req.user._id.toString();
  const isAdmin = req.user.hasAnyRole(["super_admin", "content_admin", "editor"]);
  if (!isOwner && !isAdmin) return next(createError("Forbidden.", 403));

  const fields = [
    "title", "summary", "body", "type", "keywords", "coAuthors",
    "status", "workflowStatus", "accessMode", "ppvPrice",
    "featured", "showOnHomepage", "workflowTemplate",
  ];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) item[f] = req.body[f];
  });
  item.updatedBy = req.user._id;

  await item.save();
  sendSuccess(res, item, 200, "Content updated.");
});

// ─── Admin: list all content ──────────────────────────────────────────────────
export const listAllContent = catchAsync(async (req, res) => {
  const { status, workflowStatus, type, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (workflowStatus) filter.workflowStatus = workflowStatus;
  if (type) filter.type = type;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    ContentItem.find(filter)
      .populate("authorUser", "fullName email institution")
      .populate("workflowTemplate", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ContentItem.countDocuments(filter),
  ]);

  sendSuccess(res, { items, total, page: Number(page), limit: Number(limit) });
});

// ─── Admin: delete content ────────────────────────────────────────────────────
export const deleteContent = catchAsync(async (req, res, next) => {
  const item = await ContentItem.findByIdAndDelete(req.params.id);
  if (!item) return next(createError("Content not found.", 404));
  sendSuccess(res, null, 200, "Content deleted.");
});

// ─── Public: homepage featured content ───────────────────────────────────────
export const getHomepageContent = catchAsync(async (req, res) => {
  const items = await ContentItem.find({ status: "published", showOnHomepage: true })
    .populate("authorUser", "fullName institution photoUrl")
    .sort({ createdAt: -1 })
    .limit(10);
  sendSuccess(res, items);
});

// ─── Track: record a view or copy event ──────────────────────────────────────
export const trackContent = catchAsync(async (req, res, next) => {
  const { type } = req.body; // "view" | "copy"
  if (!["view", "copy"].includes(type)) {
    return next(createError("Invalid tracking type. Use 'view' or 'copy'.", 400));
  }

  const item = await ContentItem.findById(req.params.id);
  if (!item) return next(createError("Content not found.", 404));

  if (type === "view") item.viewCount = (item.viewCount || 0) + 1;
  if (type === "copy") item.copyCount = (item.copyCount || 0) + 1;

  await item.save({ validateModifiedOnly: true });
  sendSuccess(res, { viewCount: item.viewCount, copyCount: item.copyCount });
});


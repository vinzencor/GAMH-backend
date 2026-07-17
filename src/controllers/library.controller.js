import LibraryItem from "../models/LibraryItem.js";
import SavedLibraryItem from "../models/SavedLibraryItem.js";
import { catchAsync, sendSuccess, createError } from "../utils/helpers.js";
import { getUploadedS3Keys } from "../utils/upload.js";

const parseAuthors = (authorsJson) => {
  if (!authorsJson) return [];
  if (Array.isArray(authorsJson)) return authorsJson;
  if (typeof authorsJson === "string") {
    const parsed = JSON.parse(authorsJson);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
};

// ─── Public: list library items ───────────────────────────────────────────────
export const listLibrary = catchAsync(async (req, res) => {
  const { category, access, search, page = 1, limit = 30 } = req.query;
  const filter = { submissionStatus: "published" };
  if (category) filter.category = { $regex: category, $options: "i" };
  if (access) filter.accessType = access;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { abstract: { $regex: search, $options: "i" } },
    ];
  }

  // Non-members can only see open access items
  const isActiveMember =
    req.user &&
    (req.user.hasAnyRole(["member", "subscriber", "super_admin", "content_admin", "editor"]));

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    LibraryItem.find(filter).sort({ year: -1, createdAt: -1 }).skip(skip).limit(Number(limit)),
    LibraryItem.countDocuments(filter),
  ]);

  const shapedItems = isActiveMember
    ? items
    : items.map((item) => {
        const obj = item.toObject();
        if (obj.accessType === "members_only") {
          obj.pdfUrl = "";
        }
        return obj;
      });

  sendSuccess(res, { items: shapedItems, total, page: Number(page) });
});

// ─── User: list own library submissions ──────────────────────────────────────
export const getMyLibrarySubmissions = catchAsync(async (req, res) => {
  const items = await LibraryItem.find({ createdBy: req.user._id })
    .sort({ createdAt: -1 });
  sendSuccess(res, items);
});

// ─── User: create library draft ──────────────────────────────────────────────
export const createLibraryDraft = catchAsync(async (req, res, next) => {
  const { title, abstract, authorsJson, venue, year, category, accessType } = req.body;
  if (!title) return next(createError("Title is required.", 400));

  const pdfUrl = req.file ? req.file.s3Url : "";

  const item = await LibraryItem.create({
    title,
    abstract,
    authorsJson: parseAuthors(authorsJson),
    venue,
    year,
    category,
    accessType: accessType || "open",
    submissionStatus: "draft",
    pdfUrl,
    createdBy: req.user._id,
  });

  const response = item.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 201, "Library draft created.");
});

// ─── User: submit library item ───────────────────────────────────────────────
export const submitLibraryItem = catchAsync(async (req, res, next) => {
  const { title, abstract, authorsJson, venue, year, category, accessType } = req.body;
  if (!title) return next(createError("Title is required.", 400));
  if (!req.file) return next(createError("PDF file is required.", 400));

  const item = await LibraryItem.create({
    title,
    abstract,
    authorsJson: parseAuthors(authorsJson),
    venue,
    year,
    category,
    accessType: accessType || "open",
    submissionStatus: "submitted",
    pdfUrl: req.file.s3Url,
    createdBy: req.user._id,
  });

  const response = item.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 201, "Library item submitted for review.");
});

// ─── User: submit existing draft ─────────────────────────────────────────────
export const submitLibraryDraft = catchAsync(async (req, res, next) => {
  const item = await LibraryItem.findById(req.params.id);
  if (!item) return next(createError("Library item not found.", 404));
  if (item.createdBy?.toString() !== req.user._id.toString()) {
    return next(createError("Forbidden.", 403));
  }
  if (!["draft", "changes_requested"].includes(item.submissionStatus)) {
    return next(createError("This item cannot be submitted in its current state.", 400));
  }

  if (req.body.title) item.title = req.body.title;
  if (req.body.abstract !== undefined) item.abstract = req.body.abstract;
  if (req.body.authorsJson !== undefined) item.authorsJson = parseAuthors(req.body.authorsJson);
  if (req.body.venue !== undefined) item.venue = req.body.venue;
  if (req.body.year !== undefined) item.year = req.body.year;
  if (req.body.category !== undefined) item.category = req.body.category;
  if (req.body.accessType !== undefined) item.accessType = req.body.accessType;
  if (req.file) item.pdfUrl = req.file.s3Url;

  if (!item.pdfUrl) return next(createError("PDF file is required before submitting.", 400));

  item.submissionStatus = "submitted";
  item.reviewNote = "";
  item.reviewedBy = null;
  item.reviewedAt = null;

  await item.save();
  const response = item.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 200, "Library draft submitted for review.");
});

// ─── Admin: create library item ───────────────────────────────────────────────
export const createLibraryItem = catchAsync(async (req, res, next) => {
  const { title, abstract, authorsJson, venue, year, category, accessType, pdfUrl } = req.body;
  if (!title) return next(createError("Title is required.", 400));

  const resolvedPdfUrl = req.file
    ? req.file.s3Url
    : (typeof pdfUrl === "string" ? pdfUrl : "");

  const item = await LibraryItem.create({
    title,
    abstract,
    authorsJson: authorsJson ? JSON.parse(authorsJson) : [],
    venue,
    year,
    category,
    accessType: accessType || "open",
    submissionStatus: "published",
    pdfUrl: resolvedPdfUrl,
    createdBy: req.user._id,
  });

  const response = item.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response, 201);
});

// ─── Admin: update library item ───────────────────────────────────────────────
export const updateLibraryItem = catchAsync(async (req, res, next) => {
  const update = { ...req.body };
  if (req.body.authorsJson && typeof req.body.authorsJson === "string") {
    update.authorsJson = JSON.parse(req.body.authorsJson);
  }
  if (req.file) update.pdfUrl = req.file.s3Url;
  if (!req.file && typeof req.body.pdfUrl === "string") update.pdfUrl = req.body.pdfUrl;
  if (update.submissionStatus === undefined) update.submissionStatus = "published";
  update.reviewedBy = req.user._id;
  update.reviewedAt = new Date();

  const item = await LibraryItem.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!item) return next(createError("Library item not found.", 404));
  const response = item.toObject();
  response.uploadedS3Keys = getUploadedS3Keys(req);
  sendSuccess(res, response);
});

// ─── Admin: review user-submitted library item ───────────────────────────────
export const reviewLibrarySubmission = catchAsync(async (req, res, next) => {
  const item = await LibraryItem.findById(req.params.id);
  if (!item) return next(createError("Library item not found.", 404));

  const { action, note = "" } = req.body;
  if (!["approve", "reject", "request_changes"].includes(action)) {
    return next(createError("action must be one of: approve, reject, request_changes.", 400));
  }

  if (action === "approve") item.submissionStatus = "published";
  if (action === "reject") item.submissionStatus = "rejected";
  if (action === "request_changes") item.submissionStatus = "changes_requested";

  item.reviewNote = note;
  item.reviewedBy = req.user._id;
  item.reviewedAt = new Date();

  await item.save();
  sendSuccess(res, item, 200, "Library submission reviewed.");
});

// ─── Admin: list all library items ───────────────────────────────────────────
export const listAllLibraryItems = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (status) filter.submissionStatus = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    LibraryItem.find(filter)
      .populate("createdBy", "fullName email institution")
      .populate("reviewedBy", "fullName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    LibraryItem.countDocuments(filter),
  ]);

  sendSuccess(res, { items, total, page: Number(page), limit: Number(limit) });
});

// ─── Admin: delete library item ───────────────────────────────────────────────
export const deleteLibraryItem = catchAsync(async (req, res, next) => {
  const item = await LibraryItem.findByIdAndDelete(req.params.id);
  if (!item) return next(createError("Library item not found.", 404));
  sendSuccess(res, null, 200, "Item deleted.");
});

// ─── User: save / unsave library item ─────────────────────────────────────────
export const saveItem = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const existing = await SavedLibraryItem.findOne({
    user: req.user._id,
    libraryItem: itemId,
  });
  if (existing) return next(createError("Already saved.", 409));

  await SavedLibraryItem.create({ user: req.user._id, libraryItem: itemId });
  sendSuccess(res, null, 201, "Item saved.");
});

export const unsaveItem = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const result = await SavedLibraryItem.findOneAndDelete({
    user: req.user._id,
    libraryItem: itemId,
  });
  if (!result) return next(createError("Saved item not found.", 404));
  sendSuccess(res, null, 200, "Item removed from saved.");
});

export const getMySavedItems = catchAsync(async (req, res) => {
  const saved = await SavedLibraryItem.find({ user: req.user._id })
    .populate("libraryItem")
    .sort({ createdAt: -1 });
  sendSuccess(res, saved.map((s) => s.libraryItem));
});

// ─── Track: record a view or copy event on a library item ─────────────────────
export const trackLibraryItem = catchAsync(async (req, res, next) => {
  const { type } = req.body; // "view" | "copy"
  if (!["view", "copy"].includes(type)) {
    return next(createError("Invalid tracking type. Use 'view' or 'copy'.", 400));
  }

  const item = await LibraryItem.findById(req.params.id);
  if (!item) return next(createError("Library item not found.", 404));

  if (type === "view") item.viewCount = (item.viewCount || 0) + 1;
  if (type === "copy") item.copyCount = (item.copyCount || 0) + 1;

  await item.save({ validateModifiedOnly: true });
  sendSuccess(res, { viewCount: item.viewCount, copyCount: item.copyCount });
});

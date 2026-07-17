import multer from "multer";
import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;
const APP_PREFIX = "GAMH";
const DEFAULT_FOLDER = "documents";
const ALLOWED_FOLDERS = new Set(["images", "documents", "journals", "papers"]);
const S3_BUCKET = process.env.S3_BUCKET || "gamh-s3-bucket";
const S3_REGION = process.env.AWS_REGION || "ap-southeast-2";

const s3Client = new S3Client({
  region: S3_REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      }
      : undefined,
});

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const normalizeFolder = (folder) => {
  const normalized = String(folder || "").trim().toLowerCase();
  if (!ALLOWED_FOLDERS.has(normalized)) {
    throw new Error(
      `Invalid upload folder "${folder}". Allowed folders: ${Array.from(ALLOWED_FOLDERS).join(", ")}.`
    );
  }
  return normalized;
};

const sanitizeBaseName = (originalName) => {
  const parsed = path.parse(originalName || "file");
  const ascii = Array.from(parsed.name.normalize("NFKD"))
    .filter((char) => char.charCodeAt(0) <= 0x7f)
    .join("");
  const compact = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return compact || "file";
};

const sanitizeExtension = (originalName) => {
  const ext = path.extname(originalName || "").toLowerCase();
  if (!ext) return "";
  const safe = ext.replace(/[^a-z0-9.]/g, "");
  return safe.startsWith(".") ? safe : `.${safe}`;
};

export const buildGamhS3Key = (folder, originalName) => {
  const safeFolder = normalizeFolder(folder || DEFAULT_FOLDER);
  const safeBase = sanitizeBaseName(originalName);
  const safeExt = sanitizeExtension(originalName);
  const filename = `${APP_PREFIX}-${safeFolder}-${safeBase}${safeExt}`;
  return `${APP_PREFIX}/${safeFolder}/${filename}`;
};

export const extractS3KeyFromValue = (value) => {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(`${APP_PREFIX}/`)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return key || null;
  } catch {
    return null;
  }
};

export const getSignedS3GetUrlFromValue = async (value, expiresInSeconds = 900) => {
  const key = extractS3KeyFromValue(value);
  if (!key) return null;

  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  );
};

const toS3ObjectUrl = (key) =>
  `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;

const resolveFolderForFile = (req, file) => {
  if (req.uploadFolderByField && req.uploadFolderByField[file.fieldname]) {
    return normalizeFolder(req.uploadFolderByField[file.fieldname]);
  }
  if (req.uploadFolder) {
    return normalizeFolder(req.uploadFolder);
  }
  return DEFAULT_FOLDER;
};

const addUploadedKey = (req, fieldName, key) => {
  if (!req.uploadedS3Keys) req.uploadedS3Keys = {};
  if (!req.uploadedS3Keys[fieldName]) req.uploadedS3Keys[fieldName] = [];
  req.uploadedS3Keys[fieldName].push(key);
};

const uploadSingleFileToS3 = async (req, file) => {
  const folder = resolveFolderForFile(req, file);
  const key = buildGamhS3Key(folder, file.originalname);
  console.log(`Uploading file "${file.originalname}" to S3 bucket "${S3_BUCKET}" with key "${key}"...`);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  // This is the canonical object URL shape. For private buckets, access still requires signed URLs.
  const url = toS3ObjectUrl(key);
  file.s3Key = key;
  file.key = key;
  file.s3Url = url;
  file.location = url;
  file.filename = path.basename(key);
console.log(`File "${file.originalname}" uploaded successfully. Accessible at: ${url}`);
  addUploadedKey(req, file.fieldname || "file", key);
};

const fileFilter = (_req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed.`), false);
  }
};

const storage = multer.memoryStorage();

export const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

export const uploadToS3 = async (req, _res, next) => {
  try {
    const allFiles = [];

    if (req.file) {
      allFiles.push(req.file);
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        allFiles.push(...req.files);
      } else {
        Object.values(req.files).forEach((value) => {
          if (Array.isArray(value)) {
            allFiles.push(...value);
          }
        });
      }
    }

    if (!allFiles.length) return next();

    await Promise.all(allFiles.map((file) => uploadSingleFileToS3(req, file)));
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware factory to set a single S3 folder for uploaded files.
 * Usage: setUploadFolder("images"), upload.single("screenshot"), uploadToS3
 */
export const setUploadFolder = (folder) => (req, _res, next) => {
  try {
    req.uploadFolder = normalizeFolder(folder);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware factory to map multipart field names to S3 folders.
 */
export const setUploadFolderByField = (fieldFolderMap = {}) => (req, _res, next) => {
  try {
    const normalized = {};
    Object.entries(fieldFolderMap).forEach(([field, folder]) => {
      normalized[field] = normalizeFolder(folder);
    });
    req.uploadFolderByField = normalized;
    next();
  } catch (error) {
    next(error);
  }
};

export const getUploadedS3Keys = (req) => req.uploadedS3Keys || {};

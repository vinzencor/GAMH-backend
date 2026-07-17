export const ROLES = {
  VISITOR: "visitor",
  REGISTERED_USER: "registered_user",
  MEMBER: "member",
  SUBSCRIBER: "subscriber",
  AUTHOR: "author",
  REVIEWER: "reviewer",
  SUB_ADMIN: "sub_admin",
  EDITOR: "editor",
  CONTENT_ADMIN: "content_admin",
  SUPER_ADMIN: "super_admin",
};

export const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.CONTENT_ADMIN, ROLES.EDITOR];

export const CONTENT_STATUSES = ["draft", "in_review", "approved", "published", "archived"];

export const WORKFLOW_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "published",
  "changes_requested",
  "rejected",
];

export const ACCESS_MODES = ["open_access", "members_only", "pay_per_view"];

export const MEMBERSHIP_STATUSES = [
  "active",
  "renewal_due",
  "expired",
  "cancelled",
  "suspended",
  "pending_verification",
  "pending",
];

export const REVIEW_STATUSES = ["assigned", "accepted", "submitted", "declined"];

export const REVIEW_RECOMMENDATIONS = [
  "accept",
  "minor_revisions",
  "major_revisions",
  "reject",
];

export const INVOICE_STATUSES = ["paid", "unpaid", "refunded", "cancelled"];

export const FEATURED_REQUEST_STATUSES = ["pending", "approved", "rejected"];

export const CONTENT_TYPES = ["article", "review", "letter", "case_study"];

export const MODULE_KEYS = [
  "dashboard",
  "pipeline",
  "analytics",
  "workflow",
  "content",
  "reviews",
  "people",
  "library",
  "users",
  "roles",
  "billing",
  "sub_admins",
  "validate_users",
  "portal_submissions",
  "portal_submit",
];

// Membership renewal warning threshold in days
export const RENEWAL_THRESHOLD_DAYS = 7;

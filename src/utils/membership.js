import Membership from "../models/Membership.js";
import { RENEWAL_THRESHOLD_DAYS } from "../config/constants.js";

/**
 * Derives membership status based on endsAt date.
 * @param {Date} endsAt
 * @returns {"active"|"renewal_due"|"expired"}
 */
export const deriveStatus = (endsAt) => {
  if (!endsAt) return "active"; // lifetime / no expiry
  const now = new Date();
  if (endsAt < now) return "expired";
  const diffDays = (endsAt - now) / (1000 * 60 * 60 * 24);
  if (diffDays <= RENEWAL_THRESHOLD_DAYS) return "renewal_due";
  return "active";
};

/**
 * Reconciles membership statuses for all active/renewal_due memberships.
 * Should be called before billing operations.
 */
export const reconcileMembershipStatuses = async (userId) => {
  const query = userId
    ? { user: userId, status: { $in: ["active", "renewal_due"] } }
    : { status: { $in: ["active", "renewal_due"] } };

  const memberships = await Membership.find(query);

  const updates = memberships.map(async (m) => {
    const derived = deriveStatus(m.endsAt);
    if (derived !== m.status) {
      m.status = derived;
      await m.save();
    }
  });

  await Promise.all(updates);
};

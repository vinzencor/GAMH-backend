import RoleModuleAccess from "../models/RoleModuleAccess.js";

/**
 * requireRoles(...roleNames) – blocks if user doesn't have at least one of the given roles.
 */
export const requireRoles = (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }
    const has = roles.some((r) => req.user.roles.includes(r));
    if (!has) {
      return res.status(403).json({ success: false, message: "Insufficient permissions." });
    }
    next();
  };

/**
 * requireModule(moduleKey) – checks role-based module access.
 * Checks user.moduleAccess override first, then RoleModuleAccess table.
 */
export const requireModule = (moduleKey) => async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authenticated." });
  }

  // Super admin always gets through
  if (req.user.roles.includes("super_admin")) return next();

  // Check user-level override
  if (req.user.moduleAccess?.has(moduleKey)) {
    const allowed = req.user.moduleAccess.get(moduleKey);
    if (allowed) return next();
    return res.status(403).json({ success: false, message: "Module access denied." });
  }

  // Check role-level access
  const accessRecords = await RoleModuleAccess.find({
    roleName: { $in: req.user.roles },
    moduleKey,
    canAccess: true,
  });

  if (accessRecords.length > 0) return next();

  return res.status(403).json({ success: false, message: "Module access denied." });
};

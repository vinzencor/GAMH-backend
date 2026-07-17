/**
 * Seed script – run once to populate essential data.
 * Usage: node src/utils/seed.js
 */
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import MembershipPlan from "../models/MembershipPlan.js";
import WorkflowTemplate from "../models/WorkflowTemplate.js";
import WorkflowStage from "../models/WorkflowStage.js";
import RoleModuleAccess from "../models/RoleModuleAccess.js";
import { ROLES, MODULE_KEYS } from "../config/constants.js";

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  // ── Super Admin ──────────────────────────────────────────────────────────
  const existingAdmin = await User.findOne({ email: "admin@gamh.com" });
  if (!existingAdmin) {
    await User.create({
      email: "admin@gamh.com",
      password: "Admin@1234",
      fullName: "GAMH Super Admin",
      institution: "Global Research Gateway Hub",
      roles: [ROLES.SUPER_ADMIN, ROLES.REGISTERED_USER],
    });
    console.log("✅ Super admin created: admin@gamh.com / Admin@1234");
  } else {
    console.log("ℹ️  Super admin already exists");
  }

  // ── Membership Plans ─────────────────────────────────────────────────────
  const plans = [
    {
      name: "Student",
      description: "For students and early-career researchers",
      price: 1800,
      billingPeriod: "yearly",
      features: ["Access to members-only content", "Submit research papers", "Digital library access"],
    },
    {
      name: "Individual",
      description: "For independent researchers",
      price: 7500,
      billingPeriod: "yearly",
      features: [
        "All Student benefits",
        "Priority review",
        "Featured author eligibility",
        "Unlimited downloads",
      ],
    },
    {
      name: "Professional",
      description: "For professional researchers & academics",
      price: 15000,
      billingPeriod: "yearly",
      features: [
        "All Individual benefits",
        "Co-authorship listings",
        "Analytics access",
        "Certificate of membership",
      ],
    },
    {
      name: "Institutional",
      description: "For universities & research institutions",
      price: 48500,
      billingPeriod: "yearly",
      features: [
        "All Professional benefits",
        "Multiple user accounts",
        "Dedicated support",
        "Custom branding",
      ],
    },
  ];

  for (const plan of plans) {
    const exists = await MembershipPlan.findOne({ name: plan.name });
    if (!exists) {
      await MembershipPlan.create(plan);
      console.log(`✅ Plan created: ${plan.name}`);
    }
  }

  // ── Default Workflow Template ─────────────────────────────────────────────
  let template = await WorkflowTemplate.findOne({ name: "Standard Peer Review" });
  if (!template) {
    template = await WorkflowTemplate.create({
      name: "Standard Peer Review",
      isActive: true,
    });
    console.log("✅ Workflow template created");

    const stages = [
      { stageName: "Initial Screening", orderIndex: 0 },
      { stageName: "Peer Review", orderIndex: 1 },
      { stageName: "Editorial Review", orderIndex: 2 },
      { stageName: "Final Approval", orderIndex: 3 },
    ];
    for (const s of stages) {
      await WorkflowStage.create({ template: template._id, ...s });
    }
    console.log("✅ Workflow stages created");
  }

  // ── Role-Module Access Defaults ───────────────────────────────────────────
  const superAdminModules = MODULE_KEYS.map((key) => ({
    roleName: ROLES.SUPER_ADMIN,
    moduleKey: key,
    canAccess: true,
  }));
  const editorModules = [
    "dashboard", "pipeline", "analytics", "content", "reviews", "people", "library",
  ].map((key) => ({ roleName: ROLES.EDITOR, moduleKey: key, canAccess: true }));
  const contentAdminModules = [
    "dashboard", "pipeline", "content", "reviews", "library", "billing",
  ].map((key) => ({ roleName: ROLES.CONTENT_ADMIN, moduleKey: key, canAccess: true }));

  const allAccess = [...superAdminModules, ...editorModules, ...contentAdminModules];
  for (const entry of allAccess) {
    await RoleModuleAccess.findOneAndUpdate(
      { roleName: entry.roleName, moduleKey: entry.moduleKey },
      { canAccess: entry.canAccess },
      { upsert: true }
    );
  }
  console.log("✅ Role module access seeded");

  await mongoose.disconnect();
  console.log("✅ Seed complete. Disconnected.");
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});

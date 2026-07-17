import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import contentRoutes from "./routes/content.routes.js";
import workflowRoutes from "./routes/workflow.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import membershipRoutes from "./routes/membership.routes.js";
import libraryRoutes from "./routes/library.routes.js";
import featuredRoutes from "./routes/featured.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import journalRoutes from "./routes/journal.routes.js";
import happeningRoutes from "./routes/happening.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import supportRoutes from "./routes/support.routes.js";
import supportTicketRoutes from "./routes/supportTicket.routes.js";
import roleRequestRoutes from "./routes/roleRequest.routes.js";

import errorHandler from "./middleware/error.middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        "http://localhost:8080",
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:5173",
        "https://global-research-gateway-hub.vercel.app",
        "https://www.gamh.in",
        "https://gamh.in",
        process.env.CLIENT_ORIGIN
      ].filter(Boolean);
      
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith("http://localhost:")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Rate limiting – auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 30 : 1000, // Relaxed for development
  message: { success: false, message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Logging (dev only) ───────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// ─── Static uploads ───────────────────────────────────────────────────────────
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", process.env.UPLOAD_DIR || "uploads"))
);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ success: true, message: "GAMH API running." }));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/workflow", workflowRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/memberships", membershipRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/featured", featuredRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/journals", journalRoutes);
app.use("/api/happenings", happeningRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/support-requests", supportRoutes);
app.use("/api/support-tickets", supportTicketRoutes);
app.use("/api/role-requests", roleRequestRoutes);

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found." }));

// ─── Error handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);

export default app;

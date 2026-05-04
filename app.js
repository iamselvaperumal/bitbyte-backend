const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("compression");

const errorHandler = require("./middlewares/errorHandler");
const AppError = require("./utils/AppError");
const logger = require("./utils/logger");

// Root Route

// ── Route imports ──────────────────────────────────────────────────────────
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const employeeRoutes = require("./routes/employee.routes");
const adminRoutes = require("./routes/admin.routes");
const superAdminRoutes = require("./routes/superAdmin.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const notificationRoutes = require("./routes/notification.routes");
const attendanceRoutes = require("./routes/attendance.routes");

const app = express();

// Trust proxy for rate limiting (needed for Render/Heroku/Vercel)
app.set('trust proxy', 1);

// ── Security middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(mongoSanitize());

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: "*", // later you can restrict to your Vercel domain,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ── Rate limiting ──────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    status: "fail",
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    status: "fail",
    message: "Too many login attempts. Try again after 15 minutes.",
  },
});

app.use("/api", globalLimiter);
app.use("/api/v1/auth", authLimiter);

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(compression());

// ── HTTP logging ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );
}

// ── Health check ───────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});
//Root Route added
app.get("/", (req, res) => {
  res.send("Backend is live 🚀");
});
// ── API routes ─────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/employee", employeeRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/super-admin", superAdminRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/attendance", attendanceRoutes);

// ── 404 handler ────────────────────────────────────────────────────────────
app.all("*", (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// ── Global error handler ──────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;

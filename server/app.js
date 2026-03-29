const cors = require("cors");
const express = require("express");
const env = require("./config/env");
const { optionalAuth } = require("./middleware/auth");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

const allowedOriginMatchers = env.corsOriginPatterns.map(wildcardToRegex);

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  return allowedOriginMatchers.some((regex) => regex.test(origin));
}

function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      exposedHeaders: ["Authorization"],
      maxAge: 3600,
    }),
  );

  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));
  app.use(optionalAuth);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", runtime: "node" });
  });

  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/stories", require("./routes/stories"));
  app.use("/api/categories", require("./routes/categories"));
  app.use("/api/authors", require("./routes/authors"));
  app.use("/api/chapters", require("./routes/chapters"));
  app.use("/api/comments", require("./routes/comments"));
  app.use("/api/users", require("./routes/users"));
  app.use("/api/ratings", require("./routes/ratings"));
  app.use("/api/bookmarks", require("./routes/bookmarks"));
  app.use("/api/reader-notes", require("./routes/readerNotes"));
  app.use("/api/reading-history", require("./routes/readingHistory"));
  app.use("/api/payments", require("./routes/payments"));
  app.use("/api/notifications", require("./routes/notifications"));
  app.use("/api/reports", require("./routes/reports"));
  app.use("/api/gifs", require("./routes/gifs"));
  app.use("/api/admin", require("./routes/admin"));
  app.use("/api/upload", require("./routes/upload"));
  app.use("/api/email", require("./routes/email"));
  app.use("/api/checkin", require("./routes/checkin"));
  app.use("/api/leaderboard", require("./routes/leaderboard"));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;

const { logError, logWarn } = require("../utils/logger");

function notFoundHandler(req, res) {
  logWarn(`404 ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: "Error: Endpoint not found." });
}

function errorHandler(error, req, res, _next) {
  let status = error.status || 500;

  if (error?.name === "ValidationError") {
    status = 400;
  } else if (error?.code === 11000) {
    status = 400;
  }

  const message =
    status >= 500
      ? error.message || "Internal server error."
      : error.message;

  if (status >= 500) {
    logError(`HTTP ${status} ${req.method} ${req.originalUrl}`, error);
  } else {
    logWarn(`HTTP ${status} ${req.method} ${req.originalUrl}: ${message || "Unexpected error."}`);
  }

  res.status(status).json({
    message: message || "Unexpected error.",
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};

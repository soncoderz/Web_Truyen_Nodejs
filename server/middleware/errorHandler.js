function notFoundHandler(_req, res) {
  res.status(404).json({ message: "Error: Endpoint not found." });
}

function errorHandler(error, _req, res, _next) {
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
    console.error(error);
  }

  res.status(status).json({
    message: message || "Unexpected error.",
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};

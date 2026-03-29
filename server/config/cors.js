const env = require("./env");

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

function resolveCorsOrigin(origin, callback) {
  if (isAllowedOrigin(origin)) {
    return callback(null, true);
  }

  return callback(new Error("Not allowed by CORS"));
}

const corsOptions = {
  origin: resolveCorsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  exposedHeaders: ["Authorization"],
  maxAge: 3600,
};

module.exports = {
  corsOptions,
  isAllowedOrigin,
};

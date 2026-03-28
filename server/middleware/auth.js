const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { buildMessage } = require("../utils/serialize");

function extractBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function optionalAuth(req, _res, next) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret);
  } catch (_error) {
    req.user = null;
  }

  return next();
}

function requireAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json(buildMessage("Error: Unauthorized"));
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch (_error) {
    return res.status(401).json(buildMessage("Error: Unauthorized"));
  }
}

function requireRoles(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json(buildMessage("Error: Unauthorized"));
    }

    const hasRole = roles.some((role) => req.user.roles?.includes(role));
    if (!hasRole) {
      return res.status(403).json(buildMessage("Error: Access denied"));
    }

    return next();
  };
}

module.exports = {
  optionalAuth,
  requireAuth,
  requireRoles,
};

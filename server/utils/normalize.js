const { Types } = require("mongoose");

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeId(value) {
  if (!hasText(value)) {
    return null;
  }

  return String(value).trim();
}

function isObjectId(value) {
  return Types.ObjectId.isValid(value);
}

function toObjectId(value) {
  if (!isObjectId(value)) {
    return null;
  }

  return new Types.ObjectId(String(value));
}

function toIdString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === "object") {
    if (value.$id) {
      return toIdString(value.$id);
    }

    if (value._id) {
      return toIdString(value._id);
    }

    if (value.id) {
      return toIdString(value.id);
    }
  }

  return String(value);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return Array.from(new Set(ensureArray(values).map(normalizeId).filter(Boolean)));
}

function normalizeLong(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.trunc(numeric);
}

module.exports = {
  ensureArray,
  hasText,
  isObjectId,
  normalizeId,
  normalizeLong,
  toIdString,
  toObjectId,
  uniqueStrings,
};

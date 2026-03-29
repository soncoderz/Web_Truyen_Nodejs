const express = require("express");
const mongoose = require("mongoose");
const Comment = require("../models/comment");
const Story = require("../models/story");
const User = require("../models/user");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const { hydrateStories } = require("../services/hydrationService");
const { buildPublicProfilePayload } = require("../services/publicProfileService");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage } = require("../utils/serialize");

const router = express.Router();
const PROFILE_HEADLINE_MAX_LENGTH = 80;
const PROFILE_BIO_MAX_LENGTH = 320;
const PROFILE_README_MAX_LENGTH = 8000;
const PROFILE_AVATAR_MAX_LENGTH = 500;

function normalizeSingleLine(value, maxLength) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.slice(0, maxLength);
}

function normalizeMultiline(value, maxLength) {
  const normalized = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.slice(0, maxLength);
}

function normalizeAccentColor(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : "";
}

function normalizeReadme(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .slice(0, PROFILE_README_MAX_LENGTH)
    .trim();
}

function normalizeAvatarUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length > PROFILE_AVATAR_MAX_LENGTH) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    return ["http:", "https:"].includes(parsed.protocol) ? normalized : "";
  } catch (_error) {
    return "";
  }
}

function buildEditableProfileSettings(user) {
  const profile = buildPublicProfilePayload(user);

  return {
    avatar: profile.avatar || "",
    headline: profile.headline || "",
    bio: profile.bio || "",
    accentColor: profile.accentColor || "",
    readme: profile.readme || "",
    limits: {
      headline: PROFILE_HEADLINE_MAX_LENGTH,
      bio: PROFILE_BIO_MAX_LENGTH,
      readme: PROFILE_README_MAX_LENGTH,
    },
  };
}

function approvedStoryQuery() {
  return {
    $or: [
      { approvalStatus: "APPROVED" },
      { approvalStatus: { $exists: false } },
      { approvalStatus: null },
    ],
  };
}

router.get(
  "/me/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);

    res.json({
      settings: buildEditableProfileSettings(user),
    });
  }),
);

router.put(
  "/me/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "avatar")) {
      user.avatar = normalizeAvatarUrl(req.body?.avatar);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "headline")) {
      user.profileHeadline = normalizeSingleLine(
        req.body?.headline,
        PROFILE_HEADLINE_MAX_LENGTH,
      );
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "bio")) {
      user.profileBio = normalizeMultiline(req.body?.bio, PROFILE_BIO_MAX_LENGTH);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "accentColor")) {
      user.profileAccentColor = normalizeAccentColor(req.body?.accentColor);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "readme")) {
      user.profileReadme = normalizeReadme(req.body?.readme);
    }

    await user.save();

    res.json({
      message: "Đã cập nhật hồ sơ công khai.",
      settings: buildEditableProfileSettings(user),
      profile: buildPublicProfilePayload(user),
    });
  }),
);

router.get(
  "/:id/public",
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json(buildMessage("Lỗi: Không tìm thấy người dùng!"));
    }

    const user = await User.findById(req.params.id).lean();
    if (!user) {
      return res.status(404).json(buildMessage("Lỗi: Không tìm thấy người dùng!"));
    }

    const [commentCount, publishedStoryCount, recentStories] = await Promise.all([
      Comment.countDocuments({ userId: String(user._id) }),
      Story.countDocuments({
        uploaderId: String(user._id),
        ...approvedStoryQuery(),
      }),
      Story.find({
        uploaderId: String(user._id),
        ...approvedStoryQuery(),
      })
        .sort({ updatedAt: -1 })
        .limit(4)
        .lean(),
    ]);

    res.json({
      profile: buildPublicProfilePayload(user, {
        commentCount,
        publishedStoryCount,
      }),
      recentStories: await hydrateStories(recentStories),
    });
  }),
);

module.exports = router;

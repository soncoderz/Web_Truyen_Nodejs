const express = require("express");
const Chapter = require("../models/chapter");
const Notification = require("../models/notification");
const Story = require("../models/story");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const {
  canAccessLicensedStory,
  canManageStory,
  canViewStory,
  isAdmin,
  isApprovedStatus,
} = require("../utils/permissions");
const { serializeChapterListItem } = require("../services/hydrationService");
const httpError = require("../utils/httpError");

const router = express.Router();

function buildApprovalQuery(approvalStatus) {
  if (!approvalStatus) {
    return {};
  }

  if (String(approvalStatus).toUpperCase() === "APPROVED") {
    return {
      $or: [
        { approvalStatus: "APPROVED" },
        { approvalStatus: { $exists: false } },
        { approvalStatus: null },
      ],
    };
  }

  return { approvalStatus: String(approvalStatus).toUpperCase() };
}

function markPending(chapter) {
  chapter.approvalStatus = "PENDING";
  chapter.reviewedAt = null;
  chapter.reviewedById = null;
  chapter.reviewedByUsername = null;
  chapter.reviewNote = null;
}

function markReviewed(chapter, approvalStatus, reviewer, reviewNote) {
  chapter.approvalStatus = String(approvalStatus || "APPROVED").toUpperCase();
  chapter.reviewedAt = new Date();
  chapter.reviewedById = reviewer.id;
  chapter.reviewedByUsername = reviewer.username;
  chapter.reviewNote = reviewNote ? String(reviewNote).trim() : null;
}

async function sendNewChapterNotifications(story, chapter) {
  const followers = await User.find({ followedStoryIds: String(story.id || story._id) }).lean();
  if (followers.length === 0) {
    return;
  }

  await Notification.insertMany(
    followers.map((user) => ({
      userId: user._id.toString(),
      message: `Chuong moi: ${chapter.title}`,
      storyId: String(story.id || story._id),
      chapterId: String(chapter.id || chapter._id),
    })),
  );
}

router.get(
  "/story/:storyId/manage",
  requireAuth,
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.storyId).lean();
    if (!story) {
      throw httpError(400, "Error: Story not found!");
    }

    if (!canManageStory(serializeDoc(story), req.user)) {
      throw httpError(403, "Error: You do not have permission to view these chapters.");
    }

    const chapters = await Chapter.find({ storyId: req.params.storyId })
      .sort({ chapterNumber: 1 })
      .lean();
    res.json(chapters.map(serializeDoc));
  }),
);

router.get(
  "/story/:storyId",
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.storyId).lean();
    if (!story) {
      return res.json([]);
    }

    const plainStory = serializeDoc(story);
    if (!canViewStory(plainStory, req.user)) {
      return res.json([]);
    }

    const chapters = await Chapter.find({ storyId: req.params.storyId })
      .sort({ chapterNumber: 1 })
      .lean();

    const visibleChapters = canManageStory(plainStory, req.user)
      ? chapters
      : chapters.filter((chapter) => isApprovedStatus(chapter.approvalStatus));

    res.json(visibleChapters.map(serializeChapterListItem));
  }),
);

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const chapters = await Chapter.find({ uploaderId: user.id })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(chapters.map(serializeDoc));
  }),
);

router.get(
  "/review",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const query = {
      ...buildApprovalQuery(req.query.approvalStatus || "PENDING"),
    };

    if (req.query.storyId) {
      query.storyId = req.query.storyId;
    }

    const chapters = await Chapter.find(query).sort({ updatedAt: -1 }).lean();
    res.json(chapters.map(serializeDoc));
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) {
      return res.status(400).json(buildMessage("Error: Chapter not found!"));
    }

    const story = await Story.findById(chapter.storyId).lean();
    if (!story) {
      return res.status(400).json(buildMessage("Error: Story not found!"));
    }

    const plainStory = serializeDoc(story);
    let purchasedStoryIds = [];

    if (req.user?.id) {
      const user = await User.findById(req.user.id).lean();
      purchasedStoryIds = user?.purchasedStoryIds || [];
    }

    const visible =
      canViewStory(plainStory, req.user) &&
      canAccessLicensedStory(plainStory, req.user, purchasedStoryIds) &&
      (isApprovedStatus(chapter.approvalStatus) || canManageStory(plainStory, req.user));

    if (!visible) {
      if (
        isApprovedStatus(story.approvalStatus) &&
        story.licensed &&
        Number(story.unlockPrice || 0) > 0 &&
        !canManageStory(plainStory, req.user) &&
        !purchasedStoryIds.includes(String(story._id))
      ) {
        return res
          .status(402)
          .json(buildMessage("Error: Buy this licensed story before reading."));
      }

      return res.status(404).json(buildMessage("Error: Chapter not found!"));
    }

    res.json(serializeDoc(chapter));
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [user, story, existingChapter] = await Promise.all([
      getCurrentUserDocument(req),
      Story.findById(req.body.storyId),
      Chapter.findOne({
        storyId: req.body.storyId,
        chapterNumber: Number(req.body.chapterNumber),
      }),
    ]);

    if (!story) {
      throw httpError(400, "Error: Story not found!");
    }

    if (!canManageStory(serializeDoc(story), req.user)) {
      throw httpError(403, "Error: You do not have permission to add chapters to this story.");
    }

    if (existingChapter) {
      throw httpError(400, "Error: Chapter number already exists in this story.");
    }

    const admin = isAdmin(req.user);
    const chapter = new Chapter({
      storyId: req.body.storyId,
      chapterNumber: Number(req.body.chapterNumber),
      title: req.body.title,
      content: req.body.content || null,
      pages: Array.isArray(req.body.pages) ? req.body.pages : [],
      uploaderId: user.id,
      uploaderUsername: user.username,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (admin) {
      markReviewed(chapter, "APPROVED", req.user, null);
    } else {
      markPending(chapter);
    }

    await chapter.save();
    if (admin && isApprovedStatus(story.approvalStatus)) {
      await sendNewChapterNotifications(story, chapter);
    }

    res.json(serializeDoc(chapter));
  }),
);

router.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) {
      throw httpError(400, "Error: Chapter not found!");
    }

    const story = await Story.findById(chapter.storyId);
    if (!story) {
      throw httpError(400, "Error: Story not found!");
    }

    if (!canManageStory(serializeDoc(story), req.user)) {
      throw httpError(403, "Error: You do not have permission to update this chapter.");
    }

    const existingChapter = await Chapter.findOne({
      storyId: chapter.storyId,
      chapterNumber: Number(req.body.chapterNumber),
    });
    if (existingChapter && String(existingChapter._id) !== String(chapter._id)) {
      throw httpError(400, "Error: Chapter number already exists in this story.");
    }

    const previousStatus = chapter.approvalStatus;
    chapter.title = req.body.title;
    chapter.content = req.body.content || null;
    chapter.chapterNumber = Number(req.body.chapterNumber);
    chapter.pages = Array.isArray(req.body.pages) ? req.body.pages : [];
    chapter.updatedAt = new Date();

    if (isAdmin(req.user)) {
      markReviewed(chapter, "APPROVED", req.user, null);
    } else {
      markPending(chapter);
    }

    await chapter.save();
    if (
      isAdmin(req.user) &&
      previousStatus !== "APPROVED" &&
      isApprovedStatus(story.approvalStatus)
    ) {
      await sendNewChapterNotifications(story, chapter);
    }

    res.json(serializeDoc(chapter));
  }),
);

router.put(
  "/:id/approval",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) {
      throw httpError(400, "Error: Chapter not found!");
    }

    const story = await Story.findById(chapter.storyId);
    if (!story) {
      throw httpError(400, "Error: Story not found!");
    }

    const previousStatus = chapter.approvalStatus;
    chapter.updatedAt = new Date();
    markReviewed(chapter, req.body.approvalStatus, req.user, req.body.reviewNote);
    await chapter.save();

    if (
      String(req.body.approvalStatus).toUpperCase() === "APPROVED" &&
      previousStatus !== "APPROVED" &&
      isApprovedStatus(story.approvalStatus)
    ) {
      await sendNewChapterNotifications(story, chapter);
    }

    res.json(serializeDoc(chapter));
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) {
      throw httpError(400, "Error: Chapter not found!");
    }

    const story = await Story.findById(chapter.storyId);
    if (!story) {
      throw httpError(400, "Error: Story not found!");
    }

    if (!canManageStory(serializeDoc(story), req.user)) {
      throw httpError(403, "Error: You do not have permission to delete this chapter.");
    }

    await chapter.deleteOne();
    res.json(buildMessage("Chapter deleted successfully!"));
  }),
);

module.exports = router;

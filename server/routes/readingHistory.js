const express = require("express");
const ReadingHistory = require("../models/readingHistory");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { trackChapterRead } = require("../services/rewardService");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const { normalizeId } = require("../utils/normalize");

const router = express.Router();

function normalizeNote(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 4000 ? normalized.slice(0, 4000) : normalized;
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const history = await ReadingHistory.find({ userId: user.id })
      .sort({ lastReadAt: -1 })
      .lean();
    res.json(history.map(serializeDoc));
  }),
);

router.get(
  "/story/:storyId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const history = await ReadingHistory.findOne({
      userId: user.id,
      storyId: req.params.storyId,
    }).lean();
    res.json(history ? serializeDoc(history) : null);
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const storyId = normalizeId(req.body.storyId);
    const chapterId = normalizeId(req.body.chapterId);
    const note = normalizeNote(req.body.note);
    const mission = trackChapterRead(user, chapterId, new Date());

    const history = await ReadingHistory.findOneAndUpdate(
      { userId: user.id, storyId },
      {
        $set: {
          chapterId,
          lastReadAt: new Date(),
          ...(req.body.note !== undefined ? { note } : {}),
        },
        $setOnInsert: {
          userId: user.id,
          storyId,
        },
      },
      { new: true, upsert: true },
    );

    await user.save();

    res.json({
      ...serializeDoc(history),
      mission,
    });
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    await ReadingHistory.deleteOne({ _id: req.params.id, userId: user.id });
    res.json(buildMessage("History deleted!"));
  }),
);

module.exports = router;

const ReadingHistory = require("../models/readingHistory");
const asyncHandler = require("../utils/asyncHandler");
const { trackChapterRead } = require("../services/rewardService");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const { normalizeId } = require("../utils/normalize");

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

const listReadingHistory = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const history = await ReadingHistory.find({ userId: user.id })
    .sort({ lastReadAt: -1 })
    .lean();
  res.json(history.map(serializeDoc));
});

const getStoryReadingHistory = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const history = await ReadingHistory.findOne({
    userId: user.id,
    storyId: req.params.storyId,
  }).lean();
  res.json(history ? serializeDoc(history) : null);
});

const upsertReadingHistory = asyncHandler(async (req, res) => {
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
});

const deleteReadingHistory = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  await ReadingHistory.deleteOne({ _id: req.params.id, userId: user.id });
  res.json(buildMessage("ÄÃ£ xÃ³a lá»‹ch sá»­!"));
});

module.exports = {
  listReadingHistory,
  getStoryReadingHistory,
  upsertReadingHistory,
  deleteReadingHistory,
};

const Rating = require("../models/rating");
const Story = require("../models/story");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { serializeDoc, buildMessage } = require("../utils/serialize");

async function updateStoryRating(storyId) {
  const ratings = await Rating.find({ storyId }).lean();
  const average =
    ratings.length > 0
      ? ratings.reduce((sum, rating) => sum + Number(rating.score || 0), 0) /
        ratings.length
      : 0;

  await Story.findByIdAndUpdate(storyId, {
    averageRating: Math.round(average * 10) / 10,
    totalRatings: ratings.length,
  });
}

const rateStory = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const rating = await Rating.findOneAndUpdate(
    { storyId: req.body.storyId, userId: user.id },
    {
      $set: {
        storyId: req.body.storyId,
        userId: user.id,
        score: Number(req.body.score),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { new: true, upsert: true },
  );

  await updateStoryRating(req.body.storyId);
  res.json(serializeDoc(rating));
});

const getStoryRatingSummary = asyncHandler(async (req, res) => {
  const ratings = await Rating.find({ storyId: req.params.storyId }).lean();
  const average =
    ratings.length > 0
      ? ratings.reduce((sum, rating) => sum + Number(rating.score || 0), 0) /
        ratings.length
      : 0;

  res.json({
    averageRating: Math.round(average * 10) / 10,
    totalRatings: ratings.length,
  });
});

const getUserStoryRating = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const rating = await Rating.findOne({
    storyId: req.params.storyId,
    userId: user.id,
  }).lean();

  if (!rating) {
    return res.json(buildMessage("No rating yet"));
  }

  return res.json(serializeDoc(rating));
});

module.exports = {
  rateStory,
  getStoryRatingSummary,
  getUserStoryRating,
};

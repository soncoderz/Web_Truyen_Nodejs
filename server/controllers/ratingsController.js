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

// Danh gia (rating) 1 truyen - ho tro them diem gia hoac cap nhat diem cu
// Upsert logic: neu user da danh gia truyen nay roi thi cap nhat score, ko thi tao moi
// Auto update truyen: tinh toan average rating va total ratings cua truyen
const rateStory = asyncHandler(async (req, res) => {
  // 1. Lay thong tin user hien tai
  const user = await getCurrentUserDocument(req);
  
  // 2. Upsert rating: neu da co rating cua user cho truyen nay thi cap nhat, ko thi tao moi
  const rating = await Rating.findOneAndUpdate(
    { storyId: req.body.storyId, userId: user.id },
    {
      // $set: cap nhat hoac tao thong tin rating (storyId, userId, score)
      $set: {
        storyId: req.body.storyId,
        userId: user.id,
        score: Number(req.body.score),
      },
      // $setOnInsert: chi set createdAt khi tao record moi
      $setOnInsert: { createdAt: new Date() },
    },
    { new: true, upsert: true },
  );

  // 3. Tinh toan va cap nhat average rating + total ratings cho truyen
  // (lay tat ca rating cua truyen, tinh trung binh, lam tron 1 le phan)
  await updateStoryRating(req.body.storyId);
  
  // 4. Tra ve rating object da luu (voi ID, timestamp, v.v.)
  res.json(serializeDoc(rating));
});

/**
 * Lấy thống ké cấp nđiểm và điểm trung bình của một truyện
 * @param {Object} req - Express request object, chứa story ID trong params
 * @param {Object} res - Express response object
 */
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

/**
 * Lấy điểm đánh giá của người dùng hiện tại cho một truyện
 * @param {Object} req - Express request object, chứa story ID trong params
 * @param {Object} res - Express response object
 */
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

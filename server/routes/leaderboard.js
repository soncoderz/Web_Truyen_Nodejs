const express = require("express");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

/**
 * GET /api/leaderboard/top-coins
 * Trả về top 10 người dùng có số xu cao nhất.
 * Chỉ public các trường an toàn: username, avatar, coinBalance, equippedProfileSkinId.
 */
router.get(
  "/top-coins",
  asyncHandler(async (_req, res) => {
    const users = await User.find({ coinBalance: { $gt: 0 } })
      .select("username avatar coinBalance equippedProfileSkinId")
      .sort({ coinBalance: -1 })
      .limit(10)
      .lean();

    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      id: String(user._id),
      username: user.username,
      avatar: user.avatar || null,
      coinBalance: Number(user.coinBalance || 0),
      equippedProfileSkinId: user.equippedProfileSkinId || "default",
    }));

    return res.json(leaderboard);
  }),
);

module.exports = router;

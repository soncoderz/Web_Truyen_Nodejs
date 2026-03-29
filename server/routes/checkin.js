const express = require("express");
const User = require("../models/user");
const { getDateKey } = require("../services/rewardService");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage } = require("../utils/serialize");

const router = express.Router();

const CHECKIN_COIN_REWARD = 20;

/**
 * POST /api/checkin
 * Điểm danh hàng ngày để nhận xu. Mỗi ngày chỉ được điểm danh 1 lần (theo giờ VN).
 */
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const todayKey = getDateKey();

    if (user.checkInDateKey === todayKey) {
      return res.status(400).json(buildMessage("Bạn đã điểm danh hôm nay rồi. Hãy quay lại vào ngày mai!"));
    }

    user.coinBalance = Number(user.coinBalance || 0) + CHECKIN_COIN_REWARD;
    user.checkInDateKey = todayKey;
    await user.save();

    return res.json({
      message: `Điểm danh thành công! Bạn nhận được ${CHECKIN_COIN_REWARD} xu.`,
      coinBalance: user.coinBalance,
      checkInDateKey: todayKey,
      reward: CHECKIN_COIN_REWARD,
    });
  }),
);

module.exports = router;

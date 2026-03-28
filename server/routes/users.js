const express = require("express");
const mongoose = require("mongoose");
const Comment = require("../models/comment");
const Story = require("../models/story");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");
const { hydrateStories } = require("../services/hydrationService");
const { buildPublicProfilePayload } = require("../services/publicProfileService");
const { buildMessage } = require("../utils/serialize");

const router = express.Router();

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

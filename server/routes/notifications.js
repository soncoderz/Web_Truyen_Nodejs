const express = require("express");
const Notification = require("../models/notification");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const notifications = await Notification.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(notifications.map(serializeDoc));
  }),
);

router.get(
  "/unread-count",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const count = await Notification.countDocuments({
      userId: user.id,
      isRead: false,
    });
    res.json({ count });
  }),
);

router.put(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: user.id,
    });

    if (!notification) {
      throw httpError(400, "Lỗi: Không tìm thấy thông báo!");
    }

    notification.isRead = true;
    await notification.save();
    res.json(buildMessage("Notification marked as read!"));
  }),
);

router.put(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    await Notification.updateMany(
      { userId: user.id, isRead: false },
      { $set: { isRead: true } },
    );
    res.json(buildMessage("All notifications marked as read!"));
  }),
);

module.exports = router;

const Story = require("../models/story");
const Notification = require("../models/notification");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");

async function enrichNotifications(notifications) {
  const serializedNotifications = notifications.map(serializeDoc);
  const storyIds = Array.from(
    new Set(
      serializedNotifications
        .map((notification) => String(notification.storyId || "").trim())
        .filter(Boolean),
    ),
  );

  if (storyIds.length === 0) {
    return serializedNotifications;
  }

  const stories = await Story.find({ _id: { $in: storyIds } })
    .select({ _id: 1, title: 1, coverImage: 1 })
    .lean();
  const storyMap = new Map(
    stories.map((story) => [String(story._id), serializeDoc(story)]),
  );

  return serializedNotifications.map((notification) => {
    const story = storyMap.get(String(notification.storyId || "").trim());
    if (!story) {
      return notification;
    }

    return {
      ...notification,
      storyTitle: notification.storyTitle || story.title || "",
      storyCoverImage: notification.storyCoverImage || story.coverImage || null,
    };
  });
}

const listNotifications = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const notifications = await Notification.find({ userId: user.id })
    .sort({ createdAt: -1 })
    .lean();
  res.json(await enrichNotifications(notifications));
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const count = await Notification.countDocuments({
    userId: user.id,
    isRead: false,
  });
  res.json({ count });
});

const markRead = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const notification = await Notification.findOne({
    _id: req.params.id,
    userId: user.id,
  });

  if (!notification) {
    throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y thÃ´ng bÃ¡o!");
  }

  notification.isRead = true;
  await notification.save();
  res.json(buildMessage("Notification marked as read!"));
});

const markAllRead = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  await Notification.updateMany(
    { userId: user.id, isRead: false },
    { $set: { isRead: true } },
  );
  res.json(buildMessage("All notifications marked as read!"));
});

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};

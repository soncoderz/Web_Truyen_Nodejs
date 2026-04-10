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

/**
 * Lấy danh sách tất cả thông báo của người dùng hiện tại
 * Sắp xếp theo thửd tự từ mới nhất đến cũ
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listNotifications = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const notifications = await Notification.find({ userId: user.id })
    .sort({ createdAt: -1 })
    .lean();
  res.json(await enrichNotifications(notifications));
});

/**
 * Lấy số lượng thông báo chưa đọc của người dùng
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const count = await Notification.countDocuments({
    userId: user.id,
    isRead: false,
  });
  res.json({ count });
});

/**
 * Đánh dấu một thông báo là "đã đọc"
 * @param {Object} req - Express request object, chứa notification ID trong params
 * @param {Object} res - Express response object
 */
const markRead = asyncHandler(async (req, res) => {
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
});

// Đánh dấu tất cả thông báo của người dùng thành trạng thái "đã xem"
const markAllRead = asyncHandler(async (req, res) => {
  // Lấy thông tin user hiện hành từ mã xác thực JWT trong request
  const user = await getCurrentUserDocument(req);
  
  // Thực hiện lệnh cập nhật hàng loạt trên Database MongoDB
  // Tìm các thông báo của user (userId) và có trạng thái chưa đọc (isRead: false)
  // Sau đó thiết lập đè lại trường isRead thành true (đã đọc)
  await Notification.updateMany(
    { userId: user.id, isRead: false },
    { $set: { isRead: true } },
  );
  
  // Trả về JSON thông báo thành công cho phía client giao diện
  res.json(buildMessage("All notifications marked as read!"));
});

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};

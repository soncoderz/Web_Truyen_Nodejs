const { Schema, model } = require("mongoose");

const notificationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, default: "GENERAL", index: true },
    message: { type: String, required: true },
    actorUserId: String,
    actorUsername: String,
    storyId: String,
    storyTitle: String,
    storyCoverImage: String,
    chapterId: String,
    chapterTitle: String,
    chapterNumber: Number,
    commentId: String,
    parentCommentId: String,
    pageIndex: Number,
    targetScope: String,
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "notifications",
  },
);

module.exports = model("Notification", notificationSchema);

const { Schema, model } = require("mongoose");

const notificationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    message: { type: String, required: true },
    storyId: String,
    storyTitle: String,
    storyCoverImage: String,
    chapterId: String,
    chapterTitle: String,
    chapterNumber: Number,
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "notifications",
  },
);

module.exports = model("Notification", notificationSchema);

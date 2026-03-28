const { Schema, model } = require("mongoose");

const readingHistorySchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    storyId: { type: String, required: true, index: true },
    chapterId: String,
    note: String,
    lastReadAt: { type: Date, default: Date.now },
  },
  {
    collection: "reading_history",
  },
);

readingHistorySchema.index({ userId: 1, storyId: 1 }, { unique: true });

module.exports = model("ReadingHistory", readingHistorySchema);

const { Schema, model } = require("mongoose");

const bookmarkSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    storyId: { type: String, required: true, index: true },
    chapterId: String,
    pageIndex: Number,
    paragraphIndex: Number,
    textSnippet: String,
    note: String,
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "bookmarks",
  },
);

module.exports = model("Bookmark", bookmarkSchema);

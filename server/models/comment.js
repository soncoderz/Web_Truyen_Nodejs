const { Schema, model } = require("mongoose");

const commentSchema = new Schema(
  {
    storyId: { type: String, required: true, index: true },
    chapterId: { type: String, index: true, sparse: true },
    chapterNumber: Number,
    pageIndex: Number,
    parentCommentId: { type: String, index: true, sparse: true },
    replyToUserId: { type: String, index: true, sparse: true },
    replyToUsername: String,
    userId: { type: String, required: true, index: true },
    username: String,
    content: String,
    gifUrl: String,
    gifSize: Number,
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "comments",
  },
);

module.exports = model("Comment", commentSchema);

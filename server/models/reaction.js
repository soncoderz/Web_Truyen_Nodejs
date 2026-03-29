const { Schema, model } = require("mongoose");

const VALID_TARGET_TYPES = [
  "STORY",
  "CHAPTER",
  "MANGA_PAGE",
  "NOVEL_PARAGRAPH",
];

const VALID_EMOTIONS = [
  "LIKE",
  "LOVE",
  "HAHA",
  "WOW",
  "SAD",
  "ANGRY",
];

const reactionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    targetType: {
      type: String,
      required: true,
      enum: VALID_TARGET_TYPES,
      index: true,
    },
    targetId: { type: String, required: true, index: true },
    emotion: {
      type: String,
      required: true,
      enum: VALID_EMOTIONS,
    },
    storyId: { type: String, default: null, index: true },
    chapterId: { type: String, default: null, index: true },
    pageIndex: { type: Number, default: null },
    paragraphIndex: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "reactions",
  },
);

reactionSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true },
);
reactionSchema.index({ targetType: 1, targetId: 1, emotion: 1 });

module.exports = {
  Reaction: model("Reaction", reactionSchema),
  VALID_EMOTIONS,
  VALID_TARGET_TYPES,
};

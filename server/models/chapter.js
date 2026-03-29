const { Schema, model } = require("mongoose");

const chapterSchema = new Schema(
  {
    storyId: { type: String, required: true, index: true },
    chapterNumber: { type: Number, required: true },
    title: { type: String, required: true },
    content: String,
    pages: { type: [String], default: [] },
    uploaderId: String,
    uploaderUsername: String,
    accessMode: {
      type: String,
      enum: ["FREE", "PURCHASE", "EARLY_ACCESS"],
      default: "FREE",
    },
    accessPrice: { type: Number, default: 0 },
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "APPROVED",
    },
    reviewedById: String,
    reviewedByUsername: String,
    reviewNote: String,
    reviewedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "chapters",
  },
);

chapterSchema.index({ storyId: 1, chapterNumber: 1 }, { unique: true });
chapterSchema.index({ uploaderId: 1, updatedAt: -1 });

module.exports = model("Chapter", chapterSchema);

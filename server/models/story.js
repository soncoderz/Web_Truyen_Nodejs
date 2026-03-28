const { Schema, model } = require("mongoose");

const storySchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    description: String,
    coverImage: String,
    type: { type: String, enum: ["MANGA", "NOVEL"], default: "NOVEL" },
    status: {
      type: String,
      enum: ["ONGOING", "COMPLETED", "DROPPED"],
      default: "ONGOING",
    },
    views: { type: Number, default: 0 },
    followers: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    uploaderId: String,
    uploaderUsername: String,
    licensed: { type: Boolean, default: false },
    unlockPrice: { type: Number, default: 0 },
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "APPROVED",
    },
    reviewedById: String,
    reviewedByUsername: String,
    reviewNote: String,
    reviewedAt: Date,
    categories: { type: [Schema.Types.Mixed], default: [] },
    authors: { type: [Schema.Types.Mixed], default: [] },
    relatedStoryIds: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "stories",
  },
);

storySchema.index({ updatedAt: -1 });
storySchema.index({ approvalStatus: 1 });
storySchema.index({ uploaderId: 1 });

module.exports = model("Story", storySchema);

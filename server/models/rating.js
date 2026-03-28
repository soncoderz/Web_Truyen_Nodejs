const { Schema, model } = require("mongoose");

const ratingSchema = new Schema(
  {
    storyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "ratings",
  },
);

ratingSchema.index({ storyId: 1, userId: 1 }, { unique: true });

module.exports = model("Rating", ratingSchema);

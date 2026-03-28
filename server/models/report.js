const { Schema, model } = require("mongoose");

const reportSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    storyId: { type: String, required: true, index: true },
    chapterId: String,
    reason: { type: String, required: true },
    status: { type: String, default: "PENDING" },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "reports",
  },
);

module.exports = model("Report", reportSchema);

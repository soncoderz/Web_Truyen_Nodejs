const { Schema, model } = require("mongoose");

const missionProgressSchema = new Schema(
  {
    dateKey: { type: String, default: null },
    chapterIds: { type: [String], default: [] },
    completed: { type: Boolean, default: false },
    completedAt: Date,
    rewardCoins: { type: Number, default: 0 },
  },
  { _id: false },
);

const rentedStoryAccessSchema = new Schema(
  {
    storyId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    username: { type: String, required: true, maxlength: 20, unique: true },
    email: { type: String, required: true, maxlength: 50, unique: true },
    password: { type: String, maxlength: 120 },
    googleId: { type: String, index: true, sparse: true },
    provider: { type: String, default: "local" },
    roles: { type: [Schema.Types.Mixed], default: [] },
    avatar: String,
    followedStoryIds: { type: [String], default: [] },
    walletBalance: { type: Number, default: 0 },
    coinBalance: { type: Number, default: 0 },
    purchasedStoryIds: { type: [String], default: [] },
    purchasedChapterIds: { type: [String], default: [] },
    rentedStoryAccesses: { type: [rentedStoryAccessSchema], default: [] },
    readingStreak: { type: Number, default: 0 },
    longestReadingStreak: { type: Number, default: 0 },
    lastMissionCompletedDateKey: { type: String, default: null },
    missionProgress: {
      type: missionProgressSchema,
      default: () => ({
        dateKey: null,
        chapterIds: [],
        completed: false,
        completedAt: null,
        rewardCoins: 0,
      }),
    },
    badges: { type: [String], default: [] },
    ownedProfileSkinIds: { type: [String], default: ["default"] },
    equippedProfileSkinId: { type: String, default: "default" },
    checkInDateKey: { type: String, default: null },
    resetToken: { type: String, index: true, sparse: true },
    resetTokenExpiry: Date,
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "users",
  },
);

module.exports = model("User", userSchema);

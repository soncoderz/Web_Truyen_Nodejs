const Chapter = require("../models/chapter");
const { ensureArray } = require("../utils/normalize");
const { serializeDoc } = require("../utils/serialize");

function approvedChapterQuery(storyIds) {
  return {
    storyId: { $in: storyIds },
    $or: [
      { approvalStatus: "APPROVED" },
      { approvalStatus: { $exists: false } },
      { approvalStatus: null },
    ],
  };
}

async function attachStoryChapterStats(stories) {
  const storyList = ensureArray(stories)
    .map(serializeDoc)
    .filter(Boolean);
  const storyIds = Array.from(
    new Set(
      storyList
        .map((story) => String(story?.id || "").trim())
        .filter(Boolean),
    ),
  );

  if (storyIds.length === 0) {
    return storyList;
  }

  const stats = await Chapter.aggregate([
    {
      $match: approvedChapterQuery(storyIds),
    },
    {
      $group: {
        _id: "$storyId",
        chapterCount: { $sum: 1 },
        latestChapterNumber: { $max: "$chapterNumber" },
      },
    },
  ]);

  const statsMap = new Map(
    stats.map((item) => [
      String(item?._id || "").trim(),
      {
        chapterCount: Number(item?.chapterCount || 0),
        latestChapterNumber: Number.isFinite(Number(item?.latestChapterNumber))
          ? Number(item.latestChapterNumber)
          : null,
      },
    ]),
  );

  return storyList.map((story) => {
    const entry = statsMap.get(String(story.id || "").trim());
    return {
      ...story,
      chapterCount: entry?.chapterCount || 0,
      latestChapterNumber: entry?.latestChapterNumber ?? null,
    };
  });
}

module.exports = {
  attachStoryChapterStats,
};

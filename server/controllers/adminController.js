const Chapter = require("../models/chapter");
const Comment = require("../models/comment");
const Report = require("../models/report");
const Role = require("../models/role");
const Story = require("../models/story");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");
const { extractDbRefIds } = require("../utils/dbRefs");
const { serializeDoc } = require("../utils/serialize");
const { hydrateStories } = require("../services/hydrationService");

async function hydrateAdminComments(comments) {
  const serializedComments = (Array.isArray(comments) ? comments : []).map(serializeDoc);
  const storyIds = Array.from(
    new Set(
      serializedComments
        .map((comment) => String(comment.storyId || "").trim())
        .filter(Boolean),
    ),
  );
  const chapterIds = Array.from(
    new Set(
      serializedComments
        .map((comment) => String(comment.chapterId || "").trim())
        .filter(Boolean),
    ),
  );

  const [stories, chapters] = await Promise.all([
    storyIds.length > 0
      ? Story.find({ _id: { $in: storyIds } })
          .select({ _id: 1, title: 1 })
          .lean()
      : Promise.resolve([]),
    chapterIds.length > 0
      ? Chapter.find({ _id: { $in: chapterIds } })
          .select({ _id: 1, title: 1, chapterNumber: 1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const storyMap = new Map(stories.map((story) => [String(story._id), story]));
  const chapterMap = new Map(chapters.map((chapter) => [String(chapter._id), chapter]));

  return serializedComments.map((comment) => {
    const story = storyMap.get(String(comment.storyId || "").trim()) || null;
    const chapter = chapterMap.get(String(comment.chapterId || "").trim()) || null;
    const hasPageIndex =
      comment.pageIndex !== null &&
      comment.pageIndex !== undefined &&
      Number.isInteger(Number(comment.pageIndex));
    const scope =
      hasPageIndex
        ? "PAGE"
        : comment.chapterId
          ? "CHAPTER"
          : "STORY";

    return {
      ...comment,
      scope,
      storyTitle: story?.title || null,
      chapterTitle: chapter?.title || null,
      chapterNumber:
        Number.isFinite(Number(chapter?.chapterNumber ?? comment.chapterNumber))
          ? Number(chapter?.chapterNumber ?? comment.chapterNumber)
          : null,
      preview: String(comment.content || comment.gifUrl || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180),
    };
  });
}

const getStats = asyncHandler(async (_req, res) => {
  const [
    totalStories,
    totalUsers,
    totalChapters,
    totalComments,
    pendingReports,
    pendingStories,
    pendingChapters,
    recentStories,
  ] = await Promise.all([
    Story.countDocuments(),
    User.countDocuments(),
    Chapter.countDocuments(),
    Comment.countDocuments(),
    Report.countDocuments({ status: "PENDING" }),
    Story.countDocuments({ approvalStatus: "PENDING" }),
    Chapter.countDocuments({ approvalStatus: "PENDING" }),
    Story.find({}).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  res.json({
    totalStories,
    totalUsers,
    totalChapters,
    totalComments,
    pendingReports,
    pendingStories,
    pendingChapters,
    recentStories: await hydrateStories(recentStories),
  });
});

const getStatsTrends = asyncHandler(async (_req, res) => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  const day = startOfWeek.getDay();
  const diff = day === 0 ? 6 : day - 1;
  startOfWeek.setDate(startOfWeek.getDate() - diff);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    newUsersToday,
    newUsersThisWeek,
    newUsersThisMonth,
    newStoriesThisWeek,
    newStoriesThisMonth,
    newChaptersThisWeek,
    newChaptersThisMonth,
  ] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: startOfToday } }),
    User.countDocuments({ createdAt: { $gte: startOfWeek } }),
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Story.countDocuments({ createdAt: { $gte: startOfWeek } }),
    Story.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Chapter.countDocuments({ createdAt: { $gte: startOfWeek } }),
    Chapter.countDocuments({ createdAt: { $gte: startOfMonth } }),
  ]);

  res.json({
    newUsersToday,
    newUsersThisWeek,
    newUsersThisMonth,
    newStoriesThisWeek,
    newStoriesThisMonth,
    newChaptersThisWeek,
    newChaptersThisMonth,
  });
});

const getStatsHot = asyncHandler(async (_req, res) => {
  const [topByViews, topByRating] = await Promise.all([
    Story.find({}).sort({ views: -1 }).limit(10).lean(),
    Story.find({}).sort({ averageRating: -1 }).limit(10).lean(),
  ]);

  res.json({
    topByViews: await hydrateStories(topByViews),
    topByRating: await hydrateStories(topByRating),
  });
});

const getDistribution = asyncHandler(async (_req, res) => {
  const [
    mangaCount,
    novelCount,
    ongoingCount,
    completedCount,
    droppedCount,
    allUsers,
    roles,
  ] = await Promise.all([
    Story.countDocuments({ type: "MANGA" }),
    Story.countDocuments({ type: "NOVEL" }),
    Story.countDocuments({ status: "ONGOING" }),
    Story.countDocuments({ status: "COMPLETED" }),
    Story.countDocuments({ status: "DROPPED" }),
    User.find({}).lean(),
    Role.find({}).lean(),
  ]);

  const adminRole = roles.find((role) => role.name === "ROLE_ADMIN");
  let adminCount = 0;
  let userCount = 0;

  for (const user of allUsers) {
    const roleIds = extractDbRefIds(user.roles);
    const hasAdmin = adminRole && roleIds.includes(String(adminRole._id));
    if (hasAdmin) {
      adminCount += 1;
    } else {
      userCount += 1;
    }
  }

  res.json({
    byType: [
      { name: "Manga", value: mangaCount },
      { name: "Novel", value: novelCount },
    ],
    byStatus: [
      { name: "Äang ra", value: ongoingCount },
      { name: "Da hoan thanh", value: completedCount },
      { name: "ÄÃ£ drop", value: droppedCount },
    ],
    byRole: [
      { name: "Admin", value: adminCount },
      { name: "User", value: userCount },
    ],
  });
});

const listComments = asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(20, Number(req.query.limit) || 80));
  const scope = String(req.query.scope || "ALL").trim().toUpperCase();
  const keyword = String(req.query.q || "").trim();
  const query = {};

  if (scope === "STORY") {
    query.chapterId = null;
    query.pageIndex = null;
  } else if (scope === "CHAPTER") {
    query.chapterId = { $ne: null };
    query.pageIndex = null;
  } else if (scope === "PAGE") {
    query.pageIndex = { $ne: null };
  }

  if (keyword) {
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ content: regex }, { username: regex }];
  }

  const comments = await Comment.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json(await hydrateAdminComments(comments));
});

module.exports = {
  getStats,
  getStatsTrends,
  getStatsHot,
  getDistribution,
  listComments,
};

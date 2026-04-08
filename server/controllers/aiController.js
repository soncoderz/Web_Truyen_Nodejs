const Story = require("../models/story");
const asyncHandler = require("../utils/asyncHandler");
const { buildMessage } = require("../utils/serialize");
const { hydrateStories } = require("../services/hydrationService");
const { replyWithCatalogChat } = require("../services/aiCatalogChatService");
const { attachStoryChapterStats } = require("../services/storySignalService");

const CATALOG_CACHE_TTL_MS = 15 * 1000;
let catalogCache = {
  expiresAt: 0,
  stories: [],
};

function approvedStoryQuery() {
  return {
    $or: [
      { approvalStatus: "APPROVED" },
      { approvalStatus: { $exists: false } },
      { approvalStatus: null },
    ],
  };
}

async function loadCatalogStories() {
  const now = Date.now();
  if (
    catalogCache.expiresAt > now &&
    Array.isArray(catalogCache.stories) &&
    catalogCache.stories.length > 0
  ) {
    return catalogCache.stories;
  }

  const stories = await Story.find(approvedStoryQuery())
    .select(
      "title description coverImage type status views followers averageRating totalRatings categories authors relatedStoryIds updatedAt approvalStatus",
    )
    .sort({ updatedAt: -1, followers: -1, averageRating: -1, views: -1 })
    .lean();

  const hydratedStories = await hydrateStories(stories);
  const enrichedStories = await attachStoryChapterStats(hydratedStories);
  catalogCache = {
    expiresAt: now + CATALOG_CACHE_TTL_MS,
    stories: enrichedStories,
  };

  return enrichedStories;
}

function serializeSuggestedStories(stories) {
  return (Array.isArray(stories) ? stories : []).map((story) => ({
    id: story.id,
    title: story.title,
    coverImage: story.coverImage || null,
    type: story.type || null,
    status: story.status || null,
    chapterCount: story.chapterCount || 0,
    followers: story.followers || 0,
    averageRating: story.averageRating || 0,
    authors: Array.isArray(story.authors) ? story.authors : [],
    categories: Array.isArray(story.categories) ? story.categories : [],
  }));
}

// Chat voi AI de nhan tro van (recommendation) hoac tim truyen theo mo ta
// AI se xem la danh sach toan bo truyen va goi y nhung cuon phu hop voi message
// Tra ve: AI reply + source truyen goi y + serialized story list
const chatWithCatalog = asyncHandler(async (req, res) => {
  // 1. Extract message tu request body - trim whitespace
  const message = String(req.body?.message || "").trim();
  
  // 2. Kiem tra message ko trong
  if (!message) {
    return res.status(400).json(buildMessage("Vui long nhap noi dung chat."));
  }

  // 3. Load danh sach toan bo truyen da phe duyet (voi cache 15s TTL)
  const stories = await loadCatalogStories();
  
  // 4. Goi AI service: truyen message + chat history + story list, nhan ve recommendation
  const result = await replyWithCatalogChat({
    message,
    history: Array.isArray(req.body?.history) ? req.body.history : [],
    stories,
  });

  // 5. Serialize story list, tra ve: AI reply + source truyen + recommended stories
  res.json({
    reply: result.reply,
    source: result.source,
    stories: serializeSuggestedStories(result.stories),
  });
});

module.exports = {
  chatWithCatalog,
};

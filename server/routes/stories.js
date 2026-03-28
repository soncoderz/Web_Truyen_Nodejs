const express = require("express");
const Author = require("../models/author");
const Bookmark = require("../models/bookmark");
const Category = require("../models/category");
const Chapter = require("../models/chapter");
const Story = require("../models/story");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { createDbRef, extractDbRefIds } = require("../utils/dbRefs");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const {
  canManageStory,
  canViewStory,
  isAdmin,
  isApprovedStatus,
} = require("../utils/permissions");
const {
  ensureArray,
  hasText,
  normalizeLong,
  toObjectId,
  uniqueStrings,
} = require("../utils/normalize");
const { hydrateStory, hydrateStories } = require("../services/hydrationService");
const httpError = require("../utils/httpError");

const router = express.Router();

function approvedStoryQuery() {
  return {
    $or: [
      { approvalStatus: "APPROVED" },
      { approvalStatus: { $exists: false } },
      { approvalStatus: null },
    ],
  };
}

function buildApprovalQuery(approvalStatus) {
  if (!hasText(approvalStatus)) {
    return {};
  }

  if (String(approvalStatus).toUpperCase() === "APPROVED") {
    return approvedStoryQuery();
  }

  return { approvalStatus: String(approvalStatus).toUpperCase() };
}

function normalizeUnlockPrice(value) {
  const amount = normalizeLong(value, 0);
  return amount < 0 ? 0 : amount;
}

function validateStoryPricing(story) {
  if (story.licensed && Number(story.unlockPrice || 0) <= 0) {
    return "Error: Licensed stories must have a positive unlock price.";
  }

  return null;
}

async function resolveCategories(categoryIds) {
  const ids = uniqueStrings(categoryIds);
  if (ids.length === 0) {
    return [];
  }

  const categories = await Category.find({ _id: { $in: ids } }).lean();
  if (categories.length !== ids.length) {
    throw httpError(500, "Error: Category is not found.");
  }

  return ids.map((id) => createDbRef("categories", id));
}

async function resolveAuthors(authorIds) {
  const ids = uniqueStrings(authorIds);
  if (ids.length === 0) {
    return [];
  }

  const authors = await Author.find({ _id: { $in: ids } }).lean();
  if (authors.length !== ids.length) {
    throw httpError(500, "Error: Author is not found.");
  }

  return ids.map((id) => createDbRef("authors", id));
}

function markPending(story) {
  story.approvalStatus = "PENDING";
  story.reviewedAt = null;
  story.reviewedById = null;
  story.reviewedByUsername = null;
  story.reviewNote = null;
}

function markReviewed(story, approvalStatus, reviewer, reviewNote) {
  story.approvalStatus = String(approvalStatus || "APPROVED").toUpperCase();
  story.reviewedAt = new Date();
  story.reviewedById = reviewer.id;
  story.reviewedByUsername = reviewer.username;
  story.reviewNote = hasText(reviewNote) ? String(reviewNote).trim() : null;
}

async function applyStoryRequest(story, request, createMode, allowPricingChanges) {
  story.title = request.title;
  story.description = request.description || null;

  if (request.coverImage !== undefined || createMode) {
    story.coverImage = request.coverImage || null;
  }

  if (request.status !== undefined && request.status !== null) {
    story.status = request.status;
  }

  if (request.type !== undefined && request.type !== null) {
    story.type = request.type;
  }

  if (allowPricingChanges) {
    if (request.licensed !== undefined || createMode) {
      story.licensed = Boolean(request.licensed);
    }

    if (
      request.unlockPrice !== undefined ||
      createMode ||
      !Boolean(story.licensed)
    ) {
      story.unlockPrice = story.licensed
        ? normalizeUnlockPrice(request.unlockPrice)
        : 0;
    }
  } else if (createMode) {
    story.licensed = false;
    story.unlockPrice = 0;
  }

  if (request.relatedStoryIds !== undefined) {
    story.relatedStoryIds = uniqueStrings(request.relatedStoryIds);
  } else if (createMode) {
    story.relatedStoryIds = [];
  }

  if (request.categoryIds !== undefined) {
    story.categories = await resolveCategories(request.categoryIds);
  } else if (createMode) {
    story.categories = [];
  }

  if (request.authorIds !== undefined) {
    story.authors = await resolveAuthors(request.authorIds);
  } else if (createMode) {
    story.authors = [];
  }
}

async function findStoriesByIds(ids) {
  const results = [];
  for (const id of uniqueStrings(ids)) {
    const story = await Story.findById(id).lean();
    if (story) {
      results.push(story);
    }
  }
  return results;
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const stories = await Story.find(approvedStoryQuery())
      .sort({ updatedAt: -1 })
      .lean();
    res.json(await hydrateStories(stories));
  }),
);

router.get(
  "/manage",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const stories = await Story.find(buildApprovalQuery(req.query.approvalStatus))
      .sort({ updatedAt: -1 })
      .lean();
    res.json(await hydrateStories(stories));
  }),
);

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const stories = await Story.find({ uploaderId: user.id })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(await hydrateStories(stories));
  }),
);

router.get(
  "/review",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const stories = await Story.find(
      buildApprovalQuery(req.query.approvalStatus || "PENDING"),
    )
      .sort({ updatedAt: -1 })
      .lean();
    res.json(await hydrateStories(stories));
  }),
);

router.get(
  "/trending",
  asyncHandler(async (req, res) => {
    const stories = await Story.find(approvedStoryQuery())
      .sort({ views: -1 })
      .limit(Number(req.query.limit || 10))
      .lean();
    res.json(await hydrateStories(stories));
  }),
);

router.get(
  "/new-releases",
  asyncHandler(async (req, res) => {
    const stories = await Story.find(approvedStoryQuery())
      .sort({ updatedAt: -1 })
      .limit(Number(req.query.limit || 10))
      .lean();
    res.json(await hydrateStories(stories));
  }),
);

router.get(
  "/licensed",
  asyncHandler(async (req, res) => {
    const stories = await Story.find({
      ...approvedStoryQuery(),
      licensed: true,
      unlockPrice: { $gt: 0 },
    })
      .sort({ updatedAt: -1 })
      .limit(Number(req.query.limit || 10))
      .lean();
    res.json(await hydrateStories(stories));
  }),
);

router.get(
  "/hot",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit || 10);
    const [topByViews, topByRating] = await Promise.all([
      Story.find(approvedStoryQuery()).sort({ views: -1 }).limit(limit).lean(),
      Story.find(approvedStoryQuery())
        .sort({ averageRating: -1 })
        .limit(limit)
        .lean(),
    ]);

    res.json({
      topByViews: await hydrateStories(topByViews),
      topByRating: await hydrateStories(topByRating),
    });
  }),
);

router.get(
  "/recommendations",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit || 10);
    const userId = hasText(req.query.userId) ? String(req.query.userId) : null;

    if (userId) {
      const bookmarks = await Bookmark.find({ userId })
        .sort({ createdAt: -1 })
        .lean();

      if (bookmarks.length > 0) {
        const bookmarkedStoryIds = uniqueStrings(bookmarks.map((item) => item.storyId));
        const bookmarkedStories = await findStoriesByIds(bookmarkedStoryIds);
        const categoryIds = Array.from(
          new Set(bookmarkedStories.flatMap((story) => extractDbRefIds(story.categories))),
        );

        if (categoryIds.length > 0) {
          const recommendedStories = await Story.find({
            ...approvedStoryQuery(),
            "categories.$id": {
              $in: categoryIds.map(toObjectId).filter(Boolean),
            },
            _id: {
              $nin: bookmarkedStoryIds.map(toObjectId).filter(Boolean),
            },
          })
            .sort({ averageRating: -1 })
            .limit(limit)
            .lean();

          if (recommendedStories.length > 0) {
            return res.json(await hydrateStories(recommendedStories));
          }
        }
      }
    }

    const fallbackStories = await Story.find(approvedStoryQuery())
      .sort({ averageRating: -1 })
      .limit(limit)
      .lean();
    return res.json(await hydrateStories(fallbackStories));
  }),
);

router.get(
  "/followed",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const stories = await findStoriesByIds(user.followedStoryIds || []);
    res.json(stories.filter((story) => isApprovedStatus(story.approvalStatus)));
  }),
);

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const query = {
      ...approvedStoryQuery(),
    };

    if (hasText(req.query.keyword)) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { title: { $regex: String(req.query.keyword), $options: "i" } },
          { description: { $regex: String(req.query.keyword), $options: "i" } },
        ],
      });
    }

    if (hasText(req.query.categoryId)) {
      const categoryId = toObjectId(req.query.categoryId);
      query.$and = query.$and || [];
      query.$and.push({
        "categories.$id": categoryId,
      });
    }

    if (hasText(req.query.status)) {
      query.status = String(req.query.status).toUpperCase();
    }

    if (hasText(req.query.type)) {
      query.type = String(req.query.type).toUpperCase();
    }

    const stories = await Story.find(query).sort({ updatedAt: -1 }).lean();
    res.json(await hydrateStories(stories));
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const admin = isAdmin(req.user);

    const story = new Story({
      uploaderId: user.id,
      uploaderUsername: user.username,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await applyStoryRequest(story, req.body, true, admin);
    const pricingError = validateStoryPricing(story);
    if (pricingError) {
      throw httpError(400, pricingError);
    }

    if (admin) {
      markReviewed(story, "APPROVED", req.user, null);
    } else {
      markPending(story);
    }

    await story.save();
    res.json(await hydrateStory(story));
  }),
);

router.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.id);
    if (!story) {
      throw httpError(400, "Error: Story not found!");
    }

    const user = await getCurrentUserDocument(req);
    const admin = isAdmin(req.user);
    if (!canManageStory(serializeDoc(story), req.user)) {
      throw httpError(403, "Error: You do not have permission to update this story.");
    }

    await applyStoryRequest(story, req.body, false, admin);
    const pricingError = validateStoryPricing(story);
    if (pricingError) {
      throw httpError(400, pricingError);
    }

    story.updatedAt = new Date();
    if (admin) {
      markReviewed(story, "APPROVED", req.user, null);
    } else {
      markPending(story);
      story.uploaderId = user.id;
      story.uploaderUsername = user.username;
    }

    await story.save();
    res.json(await hydrateStory(story));
  }),
);

router.put(
  "/:id/approval",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.id);
    if (!story) {
      throw httpError(400, "Error: Story not found!");
    }

    story.updatedAt = new Date();
    markReviewed(story, req.body.approvalStatus, req.user, req.body.reviewNote);
    await story.save();

    res.json(await hydrateStory(story));
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.id);
    if (!story) {
      throw httpError(400, "Error: Story not found!");
    }

    if (!canManageStory(serializeDoc(story), req.user)) {
      throw httpError(403, "Error: You do not have permission to delete this story.");
    }

    await Chapter.deleteMany({ storyId: String(story._id) });
    await story.deleteOne();
    res.json(buildMessage("Story deleted successfully!"));
  }),
);

router.put(
  "/:id/views",
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.id);
    if (!story) {
      throw httpError(400, "Error: Story not found!");
    }

    if (!isApprovedStatus(story.approvalStatus)) {
      throw httpError(400, "Error: Story is not available!");
    }

    story.views = Number(story.views || 0) + 1;
    await story.save();
    res.json(await hydrateStory(story));
  }),
);

router.post(
  "/:id/follow",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [user, story] = await Promise.all([
      getCurrentUserDocument(req),
      Story.findById(req.params.id),
    ]);

    if (!story) {
      throw httpError(400, "Error: Story or User not found!");
    }

    if (!isApprovedStatus(story.approvalStatus)) {
      throw httpError(400, "Error: Story is not available!");
    }

    user.followedStoryIds = ensureArray(user.followedStoryIds);
    const storyId = String(story._id);
    const isFollowing = user.followedStoryIds.includes(storyId);

    if (isFollowing) {
      user.followedStoryIds = user.followedStoryIds.filter((id) => id !== storyId);
      story.followers = Math.max(0, Number(story.followers || 0) - 1);
    } else {
      user.followedStoryIds.push(storyId);
      story.followers = Number(story.followers || 0) + 1;
    }

    await Promise.all([user.save(), story.save()]);
    res.json({
      isFollowing: !isFollowing,
      followers: story.followers,
    });
  }),
);

router.get(
  "/:id/is-following",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    res.json({
      isFollowing: ensureArray(user.followedStoryIds).includes(req.params.id),
    });
  }),
);

router.get(
  "/:id/related",
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.json([]);
    }

    const plainStory = serializeDoc(story);
    if (!canViewStory(plainStory, req.user)) {
      return res.json([]);
    }

    const relatedStories = await findStoriesByIds(story.relatedStoryIds || []);
    res.json(
      relatedStories.filter((item) => canViewStory(item, req.user)),
    );
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(400).json(buildMessage("Error: Story not found!"));
    }

    const hydrated = await hydrateStory(story);
    if (!canViewStory(hydrated, req.user)) {
      return res.status(404).json(buildMessage("Error: Story not found!"));
    }

    res.json(hydrated);
  }),
);

module.exports = router;

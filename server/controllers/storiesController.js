const Author = require("../models/author");
const Bookmark = require("../models/bookmark");
const Category = require("../models/category");
const Chapter = require("../models/chapter");
const Story = require("../models/story");
const asyncHandler = require("../utils/asyncHandler");
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
  toObjectId,
  uniqueStrings,
} = require("../utils/normalize");
const { hydrateStory, hydrateStories } = require("../services/hydrationService");
const {
  normalizeBundleSize,
  normalizeCurrencyAmount,
  normalizePercent,
} = require("../services/monetizationService");
const {
  buildAiStoryRecommendations,
} = require("../services/storyAiRecommendationService");
const { attachStoryChapterStats } = require("../services/storySignalService");
const httpError = require("../utils/httpError");

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
  return normalizeCurrencyAmount(value, 0);
}

function validateStoryPricing(story) {
  if (story.licensed && Number(story.unlockPrice || 0) <= 0) {
    return "Lỗi: Truyện có bản quyờn phải có giá mờŸ khóa lớn hơn 0.";
  }

  if (story.rentalEnabled && Number(story.rentalPrice || 0) <= 0) {
    return "Lỗi: Thuê truyện 7 ngày phải có giá lớn hơn 0.";
  }

  if (story.chapterBundleEnabled && Number(story.chapterBundleSize || 0) < 2) {
    return "Lỗi: Combo chương phải có ít nhất 2 chuong.";
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
    throw httpError(500, "Lỗi: Không tìm thấy thể loại.");
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

    if (request.unlockPrice !== undefined || createMode || !Boolean(story.licensed)) {
      story.unlockPrice = story.licensed ? normalizeUnlockPrice(request.unlockPrice) : 0;
    }

    if (request.rentalEnabled !== undefined || createMode) {
      story.rentalEnabled = Boolean(request.rentalEnabled);
    }

    if (
      request.rentalPrice !== undefined ||
      createMode ||
      !Boolean(story.rentalEnabled)
    ) {
      story.rentalPrice = story.rentalEnabled
        ? normalizeCurrencyAmount(request.rentalPrice, 0)
        : 0;
    }

    if (request.chapterBundleEnabled !== undefined || createMode) {
      story.chapterBundleEnabled = Boolean(request.chapterBundleEnabled);
    }

    if (
      request.chapterBundleSize !== undefined ||
      createMode ||
      !Boolean(story.chapterBundleEnabled)
    ) {
      story.chapterBundleSize = story.chapterBundleEnabled
        ? normalizeBundleSize(request.chapterBundleSize, 3)
        : 3;
    }

    if (
      request.chapterBundleDiscountPercent !== undefined ||
      createMode ||
      !Boolean(story.chapterBundleEnabled)
    ) {
      story.chapterBundleDiscountPercent = story.chapterBundleEnabled
        ? normalizePercent(request.chapterBundleDiscountPercent, 15)
        : 15;
    }

    if (request.supportEnabled !== undefined || createMode) {
      story.supportEnabled = Boolean(request.supportEnabled);
    }
  } else if (createMode) {
    story.licensed = false;
    story.unlockPrice = 0;
    story.rentalEnabled = false;
    story.rentalPrice = 0;
    story.chapterBundleEnabled = false;
    story.chapterBundleSize = 3;
    story.chapterBundleDiscountPercent = 15;
    story.supportEnabled = false;
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

/**
 * Lay danh sach tat ca truyen da phe duyet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listStories = asyncHandler(async (_req, res) => {
  const stories = await Story.find(approvedStoryQuery())
    .sort({ updatedAt: -1 })
    .lean();
  res.json(await hydrateStories(stories));
});

/**
 * Lay danh sach truyen theo trang thai phe duyet (cho admin quan ly)
 * @param {Object} req - Express request object, chua approvalStatus trong query
 * @param {Object} res - Express response object
 */
const listManageStories = asyncHandler(async (req, res) => {
  const stories = await Story.find(buildApprovalQuery(req.query.approvalStatus))
    .sort({ updatedAt: -1 })
    .lean();
  res.json(await hydrateStories(stories));
});

/**
 * Lay danh sach truyen cua nguoi dung hien tai
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listMyStories = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const stories = await Story.find({ uploaderId: user.id })
    .sort({ updatedAt: -1 })
    .lean();
  res.json(await hydrateStories(stories));
});

/**
 * Lay danh sach truyen can phe duyet (cho admin review)
 * @param {Object} req - Express request object, chua approvalStatus trong query
 * @param {Object} res - Express response object
 */
const listReviewStories = asyncHandler(async (req, res) => {
  const stories = await Story.find(
    buildApprovalQuery(req.query.approvalStatus || "PENDING"),
  )
    .sort({ updatedAt: -1 })
    .lean();
  res.json(await hydrateStories(stories));
});

/**
 * Lay danh sach truyen hot nhat theo luot xem
 * @param {Object} req - Express request object, chua limit trong query
 * @param {Object} res - Express response object
 */
const listTrendingStories = asyncHandler(async (req, res) => {
  const stories = await Story.find(approvedStoryQuery())
    .sort({ views: -1 })
    .limit(Number(req.query.limit || 10))
    .lean();
  res.json(await hydrateStories(stories));
});

/**
 * Lay danh sach truyen moi cap nhat gan day nhat
 * @param {Object} req - Express request object, chua limit trong query
 * @param {Object} res - Express response object
 */
const listNewReleaseStories = asyncHandler(async (req, res) => {
  const stories = await Story.find(approvedStoryQuery())
    .sort({ updatedAt: -1 })
    .limit(Number(req.query.limit || 10))
    .lean();
  res.json(await hydrateStories(stories));
});

/**
 * Lay danh sach truyen co ban quyen (lien kien)
 * Chi hien thi truyen da phe duyet co gia unlock lon hon 0
 * @param {Object} req - Express request object, chua limit trong query
 * @param {Object} res - Express response object
 */
const listLicensedStories = asyncHandler(async (req, res) => {
  const stories = await Story.find({
    ...approvedStoryQuery(),
    licensed: true,
    unlockPrice: { $gt: 0 },
  })
    .sort({ updatedAt: -1 })
    .limit(Number(req.query.limit || 10))
    .lean();
  res.json(await hydrateStories(stories));
});

/**
 * Lay truyen hot nhat theo so luot xem va danh gia
 * @param {Object} req - Express request object, chua limit trong query
 * @param {Object} res - Express response object
 */
const listHotStories = asyncHandler(async (req, res) => {
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
});

/**
 * Lay truyen de xuat cho nguoi dung dua tren bookmark va the loai
 * Neu khong co bookmark, tra ve truyen theo danh gia cao nhat
 * @param {Object} req - Express request object, chua userId, limit trong query
 * @param {Object} res - Express response object
 */
const listRecommendations = asyncHandler(async (req, res) => {
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
});

/**
 * Lay danh sach truyen ma nguoi dung dang theo doi
 * Chi hien thi truyen da phe duyet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listFollowedStories = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const stories = await findStoriesByIds(user.followedStoryIds || []);
  const visibleStories = stories.filter((story) => isApprovedStatus(story.approvalStatus));
  res.json(await hydrateStories(visibleStories));
});

// Tìm kiếm truyện với bộ lọc đa chiều: từ khóa, thể loại, trạng thái, loại truyện
// Hỗ trợ tìm kiếm toàn văn bản trong tiêu đề và mô tả (case-insensitive)
// Chỉ trả về truyện đã được phê duyệt, sắp xếp theo ngày cập nhật gần nhất
const searchStories = asyncHandler(async (req, res) => {
  // 1. Xây dựng query cơ bản: chỉ lấy truyện đã được phê duyệt (APPROVED status)
  const query = {
    ...approvedStoryQuery(),
  };

  // 2. Nếu có từ khóa tìm kiếm - tìm trong tiêu đề hoặc mô tả (không phân biệt hoa/thường)
  if (hasText(req.query.keyword)) {
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { title: { $regex: String(req.query.keyword), $options: "i" } },
        { description: { $regex: String(req.query.keyword), $options: "i" } },
      ],
    });
  }

  // 3. Nếu có lọc theo thể loại ID - chỉ lấy truyện chứa danh mục đó
  if (hasText(req.query.categoryId)) {
    const categoryId = toObjectId(req.query.categoryId);
    query.$and = query.$and || [];
    query.$and.push({
      "categories.$id": categoryId,
    });
  }

  // 4. Nếu có lọc theo trạng thái (ONGOING, COMPLETED, PAUSED, v.v.)
  if (hasText(req.query.status)) {
    query.status = String(req.query.status).toUpperCase();
  }

  // 5. Nếu có lọc theo loại truyện (MANGA, LIGHT_NOVEL, WEB_NOVEL, COMIC, v.v.)
  if (hasText(req.query.type)) {
    query.type = String(req.query.type).toUpperCase();
  }

  // 6. Thực hiện query với tất cả các bộ lọc, sắp xếp theo ngày cập nhật mới nhất trước
  const stories = await Story.find(query).sort({ updatedAt: -1 }).lean();
  
  // 7. Làm giàu thông tin truyện (thêm tên tác giả, danh mục, rating trung bình, v.v.)
  res.json(await hydrateStories(stories));
});

// Tạo truyện mới trong hệ thống
// Admin tạo truyện được phê duyệt ngay lập tức, User tạo truyện cần chờ phê duyệt
// Hỗ trợ cấu hình giá, bản quyền, thuê, bundle chương tùy theo quyền của người dùng
const createStory = asyncHandler(async (req, res) => {
  // 1. Lấy thông tin User hiện tại và xác định quyền hạn (Admin hay User thường)
  const user = await getCurrentUserDocument(req);
  const admin = isAdmin(req.user);

  // 2. Tạo đối tượng Story mới với thông tin cơ bản: người upload, thời gian tạo
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
});
// Cập nhật thông tin truyện (tiêu đề, mô tả, loại truyện, cấu hình giá, v.v.)
// Người dùng không phải Admin cần chờ phê duyệt lại sau khi cập nhật, Admin được phê duyệt ngay
// Kiểm tra quyền: chỉ Admin hoặc người upload mới được sửa
const updateStory = asyncHandler(async (req, res) => {
  // 1. Lấy thông tin truyện từ database, nếu không tìm thấy trả về lỗi 400
  const story = await Story.findById(req.params.id);
  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  // 2. Lấy thông tin user hiện tại và xác định quyền hạn (Admin hay User thường)
  const user = await getCurrentUserDocument(req);
  const admin = isAdmin(req.user);
  // Kiểm tra quyền: User phải là Admin hoặc là người upload truyện này
  if (!canManageStory(serializeDoc(story), req.user)) {
    throw httpError(403, "Error: You do not have permission thành update this story.");
  }

  // 3. Áp dụng các thay đổi từ request body vào story object
  // (tiêu đề, mô tả, giá, danh mục, tags, cấu hình bundle, v.v.)
  await applyStoryRequest(story, req.body, false, admin);
  
  // 4. Xác thực tính hợp lệ của cấu hình giá (nếu có)
  // Kiểm tra: giá thuê phải < giá mua, bundle phải có chương hợp lệ, v.v.
  const pricingError = validateStoryPricing(story);
  if (pricingError) {
    throw httpError(400, pricingError);
  }

  // 5. Cập nhật thời gian sửa đổi và xác định trạng thái phê duyệt
  story.updatedAt = new Date();
  // KỊCH BẢN A: Nếu User là Admin - phê duyệt ngay lập tức
  if (admin) {
    markReviewed(story, "APPROVED", req.user, null);
  } 
  // KỊCH BẢN B: Nếu User thường - đặt trạng thái chờ phê duyệt, cập nhật người upload
  else {
    markPending(story);
    story.uploaderId = user.id;
    story.uploaderUsername = user.username;
  }

  // 6. Lưu truyện vào database và trả về thông tin chi tiết đã được làm giàu thêm
  await story.save();
  res.json(await hydrateStory(story));
});
/**
 * Cap nhat trang thai phe duyet cua truyen
 * @param {Object} req - Express request object, chua story ID trong params, approvalStatus trong body
 * @param {Object} res - Express response object
 */const updateStoryApproval = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  story.updatedAt = new Date();
  markReviewed(story, req.body.approvalStatus, req.user, req.body.reviewNote);
  await story.save();

  res.json(await hydrateStory(story));
});
/**
 * Xoa truyen va tat ca chuong lien quan
 * @param {Object} req - Express request object, chua story ID trong params
 * @param {Object} res - Express response object
 */const deleteStory = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  if (!canManageStory(serializeDoc(story), req.user)) {
    throw httpError(403, "Error: You do not have permission thành delete this story.");
  }

  await Chapter.deleteMany({ storyId: String(story._id) });
  await story.deleteOne();
  res.json(buildMessage("Đã xóa truyện thành công!"));
});
/**
 * Tang so luot xem truyen
 * @param {Object} req - Express request object, chua story ID trong params
 * @param {Object} res - Express response object
 */const incrementStoryViews = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  if (!isApprovedStatus(story.approvalStatus)) {
    throw httpError(400, "Lỗi: Truyện hiện không khả dụng!");
  }

  story.views = Number(story.views || 0) + 1;
  await story.save();
  res.json(await hydrateStory(story));
});

/**
 * Theo doi hoac bo theo doi truyen
 * Them hoac xoa ID truyen khoi danh sach theo doi cua nguoi dung
 * @param {Object} req - Express request object, chua story ID trong params
 * @param {Object} res - Express response object
 */
const toggleFollowStory = asyncHandler(async (req, res) => {
  const [user, story] = await Promise.all([
    getCurrentUserDocument(req),
    Story.findById(req.params.id),
  ]);

  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện hoặc ngÆ°ời dùng!");
  }

  if (!isApprovedStatus(story.approvalStatus)) {
    throw httpError(400, "Lỗi: Truyện hiện không khả dụng!");
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
});

const getIsFollowingStory = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  res.json({
    isFollowing: ensureArray(user.followedStoryIds).includes(req.params.id),
  });
});

const listRelatedStories = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) {
    return res.json([]);
  }

  const plainStory = serializeDoc(story);
  if (!canViewStory(plainStory, req.user)) {
    return res.json([]);
  }

  const relatedStories = await findStoriesByIds(story.relatedStoryIds || []);
  res.json(relatedStories.filter((item) => canViewStory(item, req.user)));
});

const listStoryAiRecommendations = asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 6), 12));
  const story = await Story.findById(req.params.id);
  if (!story) {
    return res.json([]);
  }

  const hydratedStory = await hydrateStory(story);
  if (!canViewStory(hydratedStory, req.user)) {
    return res.json([]);
  }

  const categoryIds = extractDbRefIds(story.categories)
    .map((value) => toObjectId(value))
    .filter(Boolean);
  const authorIds = extractDbRefIds(story.authors)
    .map((value) => toObjectId(value))
    .filter(Boolean);
  const targetedCandidateLimit = Math.max(limit * 14, 60);
  const fallbackCandidateLimit = Math.max(limit * 20, 120);

  const [
    categoryMatchedStories,
    authorMatchedStories,
    candidateStories,
    manuallyRelatedStories,
  ] = await Promise.all([
    categoryIds.length > 0
      ? Story.find({
          ...approvedStoryQuery(),
          _id: { $ne: story._id },
          "categories.$id": { $in: categoryIds },
        })
          .sort({ followers: -1, averageRating: -1, views: -1, updatedAt: -1 })
          .limit(targetedCandidateLimit)
          .lean()
      : Promise.resolve([]),
    authorIds.length > 0
      ? Story.find({
          ...approvedStoryQuery(),
          _id: { $ne: story._id },
          "authors.$id": { $in: authorIds },
        })
          .sort({ followers: -1, averageRating: -1, views: -1, updatedAt: -1 })
          .limit(targetedCandidateLimit)
          .lean()
      : Promise.resolve([]),
    Story.find({
      ...approvedStoryQuery(),
      _id: { $ne: story._id },
    })
      .sort({ followers: -1, averageRating: -1, views: -1, updatedAt: -1 })
      .limit(fallbackCandidateLimit)
      .lean(),
    findStoriesByIds(story.relatedStoryIds || []),
  ]);

  const candidateMap = new Map();
  manuallyRelatedStories.forEach((item) => {
    candidateMap.set(String(item?._id || item?.id || ""), item);
  });
  authorMatchedStories.forEach((item) => {
    candidateMap.set(String(item?._id || item?.id || ""), item);
  });
  categoryMatchedStories.forEach((item) => {
    candidateMap.set(String(item?._id || item?.id || ""), item);
  });
  candidateStories.forEach((item) => {
    candidateMap.set(String(item?._id || item?.id || ""), item);
  });

  const hydratedCandidates = await hydrateStories(Array.from(candidateMap.values()));
  const visibleCandidates = hydratedCandidates.filter((item) =>
    canViewStory(item, req.user),
  );
  const enrichedStories = await attachStoryChapterStats([
    hydratedStory,
    ...visibleCandidates,
  ]);
  const baseStory =
    enrichedStories.find((item) => item.id === hydratedStory.id) || hydratedStory;
  const enrichedCandidates = enrichedStories.filter(
    (item) => item.id !== hydratedStory.id,
  );

  res.json(buildAiStoryRecommendations(baseStory, enrichedCandidates, { limit }));
});

// Lay chi tiet 1 truyen theo ID - co access control va mode optional
// Neu optional=1: tra null khi khong tim thay hoac khong co quyen (ko phat loi)
// Neu optional khac: tra loi error 400/404 khi khong tim thay hoac khong co quyen
// Truyen duoc trả ve voi du thong tin: tac gia, danh muc, rating, chapters, etc
const getStoryById = asyncHandler(async (req, res) => {
  // 1. Kiem tra query optional: neu optional=1 thi tra null instead of error
  const optional = String(req.query.optional || "") === "1";
  
  // 2. Lay truyen tu database theo ID
  const story = await Story.findById(req.params.id);
  
  // 3a. Neu story khong ton tai:
  if (!story) {
    // KỊCH BẢN A: optional=1 - tra ve null (khong phat loi)
    return optional
      ? res.json(null)
      // KỊCH BẢN B: optional khac - tra loi error 400 (Not Found)
      : res.status(400).json(buildMessage("Lỗi: Không tìm thấy truyện!"));
  }

  // 4. Lam giau thong tin truyen (them tac gia, danh muc, rating, chapters, etc)
  const hydrated = await hydrateStory(story);
  
  // 5. Kiem tra quyen xem truyen (access control)
  // Kiem tra: truyen co phe duyet hay, user co biet, user co mua access hay
  if (!canViewStory(hydrated, req.user)) {
    // KỊCH BẢN C: optional=1 va ko co quyen - tra null, khong phat loi
    return optional
      ? res.json(null)
      // KỊCH BẢN D: optional khac va ko co quyen - tra loi error 404 (Forbidden)
      : res.status(404).json(buildMessage("Lỗi: Không tìm thấy truyện!"));
  }

  // 6. Tra ve thong tin truyen da lam giau cho client
  res.json(hydrated);
});

module.exports = {
  listStories,
  listManageStories,
  listMyStories,
  listReviewStories,
  listTrendingStories,
  listNewReleaseStories,
  listLicensedStories,
  listHotStories,
  listRecommendations,
  listFollowedStories,
  searchStories,
  createStory,
  updateStory,
  updateStoryApproval,
  deleteStory,
  incrementStoryViews,
  toggleFollowStory,
  getIsFollowingStory,
  listRelatedStories,
  listStoryAiRecommendations,
  getStoryById,
};

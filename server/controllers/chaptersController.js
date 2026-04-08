const Chapter = require("../models/chapter");
const Notification = require("../models/notification");
const Story = require("../models/story");
const User = require("../models/user");
const { emitNotificationsCreated } = require("../config/socket");
const {
  CHAPTER_ACCESS_MODES,
  buildStoryMonetizationState,
  buildUserEntitlements,
  normalizeChapterAccessMode,
  normalizeCurrencyAmount,
  resolveChapterAccess,
} = require("../services/monetizationService");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const {
  canManageStory,
  canViewStory,
  isAdmin,
  isApprovedStatus,
} = require("../utils/permissions");
const { isObjectId } = require("../utils/normalize");
const { serializeChapterListItem } = require("../services/hydrationService");
const {
  buildDisplaySummary,
  generateSummary,
  normalizeSummary,
} = require("../services/chapterSummaryService");
const httpError = require("../utils/httpError");

function buildApprovalQuery(approvalStatus) {
  if (!approvalStatus) {
    return {};
  }

  if (String(approvalStatus).toUpperCase() === "APPROVED") {
    return {
      $or: [
        { approvalStatus: "APPROVED" },
        { approvalStatus: { $exists: false } },
        { approvalStatus: null },
      ],
    };
  }

  return { approvalStatus: String(approvalStatus).toUpperCase() };
}

function markPending(chapter) {
  chapter.approvalStatus = "PENDING";
  chapter.reviewedAt = null;
  chapter.reviewedById = null;
  chapter.reviewedByUsername = null;
  chapter.reviewNote = null;
}

function markReviewed(chapter, approvalStatus, reviewer, reviewNote) {
  chapter.approvalStatus = String(approvalStatus || "APPROVED").toUpperCase();
  chapter.reviewedAt = new Date();
  chapter.reviewedById = reviewer.id;
  chapter.reviewedByUsername = reviewer.username;
  chapter.reviewNote = reviewNote ? String(reviewNote).trim() : null;
}

function validateChapterPricing(chapter) {
  if (
    normalizeChapterAccessMode(chapter.accessMode) !== CHAPTER_ACCESS_MODES.FREE &&
    Number(chapter.accessPrice || 0) <= 0
  ) {
    return "Lỗi: Chuong tinh phi hoac early access phải có giá lớn hơn 0.";
  }

  return null;
}

function applyChapterAccessRequest(chapter, request, allowPricingChanges) {
  if (!allowPricingChanges) {
    if (!chapter.accessMode) {
      chapter.accessMode = CHAPTER_ACCESS_MODES.FREE;
    }
    if (!chapter.accessPrice) {
      chapter.accessPrice = 0;
    }
    return;
  }

  chapter.accessMode = normalizeChapterAccessMode(request?.accessMode);
  chapter.accessPrice =
    chapter.accessMode === CHAPTER_ACCESS_MODES.FREE
      ? 0
      : normalizeCurrencyAmount(request?.accessPrice, 0);
}

async function sendNewChapterNotifications(story, chapter) {
  const storyId = String(story.id || story._id);
  const chapterId = String(chapter.id || chapter._id);
  const followers = await User.find({ followedStoryIds: storyId }).lean();
  if (followers.length === 0) {
    return;
  }

  const chapterLabel = Number.isFinite(Number(chapter.chapterNumber))
    ? `Chuong ${chapter.chapterNumber}`
    : "Chuong moi";
  const message = chapter.title
    ? `${story.title} vua cap nhat ${chapterLabel}: ${chapter.title}`
    : `${story.title} vua cap nhat ${chapterLabel}`;

  const notifications = await Notification.insertMany(
    followers.map((user) => ({
      userId: user._id.toString(),
      message,
      storyId,
      storyTitle: story.title || "",
      storyCoverImage: story.coverImage || null,
      chapterId,
      chapterTitle: chapter.title || "",
      chapterNumber: Number.isFinite(Number(chapter.chapterNumber))
        ? Number(chapter.chapterNumber)
        : null,
      createdAt: new Date(),
    })),
  );

  emitNotificationsCreated(notifications);
}
/**
 * Lay danh sach chuong cua mot truyen cho admin quan ly
 * @param {Object} req - Express request object, chua storyId trong params
 * @param {Object} res - Express response object
 */const listManageStoryChapters = asyncHandler(async (req, res) => {
  if (!isObjectId(req.params.storyId)) {
    throw httpError(400, "Lỗi: Mã truyện khÄ‚Â´ng hợp lệ.");
  }

  const story = await Story.findById(req.params.storyId).lean();
  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  if (!canManageStory(serializeDoc(story), req.user)) {
    throw httpError(403, "Lỗi: BáÂºÂ¡n khÄ‚Â´ng có quyáÂ»Ân xem các chương nÄ‚Â y.");
  }

  const chapters = await Chapter.find({ storyId: req.params.storyId })
    .sort({ chapterNumber: 1 })
    .lean();
  res.json(chapters.map(serializeDoc));
});

/**
 * Lay danh sach chuong cua mot truyen cho doc
 * Chi hien thi tung chuong da duyet, co kiem tra quyen truy cap
 * @param {Object} req - Express request object, chua storyId trong params
 * @param {Object} res - Express response object
 */
const listStoryChapters = asyncHandler(async (req, res) => {
  if (!isObjectId(req.params.storyId)) {
    return res.json([]);
  }

  const story = await Story.findById(req.params.storyId).lean();
  if (!story) {
    return res.json([]);
  }

  const plainStory = serializeDoc(story);
  if (!canViewStory(plainStory, req.user)) {
    return res.json([]);
  }

  const currentUser = req.user?.id ? await User.findById(req.user.id).lean() : null;
  const entitlements = buildUserEntitlements(currentUser);

  const chapters = await Chapter.find({ storyId: req.params.storyId })
    .sort({ chapterNumber: 1 })
    .lean();

  const visibleChapters = canManageStory(plainStory, req.user)
    ? chapters
    : chapters.filter((chapter) => isApprovedStatus(chapter.approvalStatus));

  const storyCommerce = buildStoryMonetizationState(plainStory, req.user, entitlements);

  res.json(
    visibleChapters.map((chapter) => {
      const access = resolveChapterAccess(chapter, plainStory, req.user, entitlements);
      return serializeChapterListItem(chapter, {
        canRead: access.canRead,
        isLocked: access.isLocked,
        lockReason: access.lockReason,
        accessMode: access.accessMode,
        accessPrice: access.accessPrice,
        storyLicensed: storyCommerce.licensed,
      });
    }),
  );
});

/**
 * Lay danh sach chuong cua nguoi dung hien tai
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listMyChapters = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const chapters = await Chapter.find({ uploaderId: user.id })
    .sort({ updatedAt: -1 })
    .lean();
  res.json(chapters.map(serializeDoc));
});

/**
 * Lay danh sach chuong can reviewed
 * @param {Object} req - Express request object, chua approvalStatus, storyId trong query
 * @param {Object} res - Express response object
 */
const listReviewChapters = asyncHandler(async (req, res) => {
  const query = {
    ...buildApprovalQuery(req.query.approvalStatus || "PENDING"),
  };

  if (req.query.storyId) {
    query.storyId = req.query.storyId;
  }

  const chapters = await Chapter.find(query).sort({ updatedAt: -1 }).lean();
  res.json(chapters.map(serializeDoc));
});
// Lay chi tiet chuong - access control + monetization (early access, purchase, rental)
// Validate: ID format, story/chapter exist, view perm, read perm, approval status
// Tra ve: full chapter data OR locked response voi lockReason + accessPrice
const getChapterById = asyncHandler(async (req, res) => {
  const optional = String(req.query.optional || "") === "1";
  if (!isObjectId(req.params.id)) {
    return optional
      ? res.json(null)
      : res.status(400).json(buildMessage("Lỗi: Mã chương khÄ‚Â´ng hợp lệ!"));
  }
  const chapter = await Chapter.findById(req.params.id);
  if (!chapter) {
    return optional
      ? res.json(null)
      : res.status(400).json(buildMessage("L?i: Không tÌm th?y chuong!"));
  }

  const story = await Story.findById(chapter.storyId).lean();
  if (!story) {
    return optional
      ? res.json(null)
      : res.status(400).json(buildMessage("L?i: Không tÌm th?y truy?n!"));
  }

  const plainStory = serializeDoc(story);
  const currentUser = req.user?.id ? await User.findById(req.user.id).lean() : null;
  const entitlements = buildUserEntitlements(currentUser);
  const access = resolveChapterAccess(chapter, plainStory, req.user, entitlements);

  const visible =
    canViewStory(plainStory, req.user) &&
    access.canRead &&
    (isApprovedStatus(chapter.approvalStatus) || canManageStory(plainStory, req.user));

  if (!visible) {
    if (canViewStory(plainStory, req.user) && isApprovedStatus(chapter.approvalStatus)) {
      if (optional) {
        return res.json(null);
      }
      return res.status(402).json({
        message:
          access.lockReason === "EARLY_ACCESS_REQUIRED"
            ? "Chuong nay dang o che do early access. Hay mua rieng chuong de doc ngày."
            : access.lockReason === "CHAPTER_PURCHASE_REQUIRED"
              ? "Chuong nay can mua rieng truoc khi doc."
              : "Ban can mở khóa truyen nay truoc khi doc chuong.",
        lockReason: access.lockReason,
        accessMode: access.accessMode,
        accessPrice: access.accessPrice,
        storyId: plainStory.id,
        chapterId: String(chapter.id || chapter._id || req.params.id),
      });
      return res
        .status(402)
        .json(buildMessage("Lỗi: Hãy mua truyện có bản quyền này trước khi đọc."));
    }

    return optional
      ? res.json(null)
      : res.status(404).json(buildMessage("Lỗi: Không tìm thấy chương!"));
  }

  const storedSummary = normalizeSummary(chapter.summary) || "";
  const displaySummary = await buildDisplaySummary(plainStory, chapter);
  chapter.summary = displaySummary;

  if (displaySummary && displaySummary !== storedSummary) {
    chapter.updatedAt = new Date();
    await chapter.save();
  }

  res.json(serializeDoc(chapter));
}); 

// Tao chuong moi cho truyen - Step by step workflow
// Admin: phe duyet ngay luc tao, User: cho phe duyet cua admin
// Kiem tra: truyen co ton tai, user co quyen quan ly, chapter number ko trung
const createChapter = asyncHandler(async (req, res) => {
  const [user, story, existingChapter] = await Promise.all([
    getCurrentUserDocument(req),
    Story.findById(req.body.storyId),
    Chapter.findOne({
      storyId: req.body.storyId,
      chapterNumber: Number(req.body.chapterNumber),
    }),
  ]);

  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  if (!canManageStory(serializeDoc(story), req.user)) {
    throw httpError(403, "Lỗi: BáÂºÂ¡n khÄ‚Â´ng có quyáÂ»Ân thêm chương cho truyện nÄ‚Â y.");
  }

  if (existingChapter) {
    throw httpError(400, "Lỗi: SáÂ»â€˜ chương Ã„â€˜Ä‚Â£ tồn tại trong truyện nÄ‚Â y.");
  }

  const admin = isAdmin(req.user);
  const chapter = new Chapter({
    storyId: req.body.storyId,
    chapterNumber: Number(req.body.chapterNumber),
    title: req.body.title,
    content: req.body.content || null,
    pages: Array.isArray(req.body.pages) ? req.body.pages : [],
    uploaderId: user.id,
    uploaderUsername: user.username,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  chapter.summary = await generateSummary(story, chapter);
  applyChapterAccessRequest(chapter, req.body, admin);
  const pricingError = validateChapterPricing(chapter);
  if (pricingError) {
    throw httpError(400, pricingError);
  }

  if (admin) {
    markReviewed(chapter, "APPROVED", req.user, null);
  } else {
    markPending(chapter);
  }

  await chapter.save();
  if (admin && isApprovedStatus(story.approvalStatus)) {
    await sendNewChapterNotifications(story, chapter);
  }

  res.json(serializeDoc(chapter));
});
/**
 * Cap nhat thong tin chuong
 * Co kiem tra xung dot so chuong, kiem tra quyen quan ly
 * @param {Object} req - Express request object, chua chapter ID trong params
 * @param {Object} res - Express response object
 */const updateChapter = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findById(req.params.id);
  if (!chapter) {
    throw httpError(400, "Lỗi: Không tìm thấy chương!");
  }

  const story = await Story.findById(chapter.storyId);
  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  if (!canManageStory(serializeDoc(story), req.user)) {
    throw httpError(403, "Lỗi: BáÂºÂ¡n khÄ‚Â´ng có quyáÂ»Ân cập nhật chương nÄ‚Â y.");
  }

  const existingChapter = await Chapter.findOne({
    storyId: chapter.storyId,
    chapterNumber: Number(req.body.chapterNumber),
  });
  if (existingChapter && String(existingChapter._id) !== String(chapter._id)) {
    throw httpError(400, "Lỗi: SáÂ»â€˜ chương Ã„â€˜Ä‚Â£ tồn tại trong truyện nÄ‚Â y.");
  }

  const previousStatus = chapter.approvalStatus;
  chapter.title = req.body.title;
  chapter.content = req.body.content || null;
  chapter.chapterNumber = Number(req.body.chapterNumber);
  chapter.pages = Array.isArray(req.body.pages) ? req.body.pages : [];
  chapter.summary = await generateSummary(story, chapter);
  chapter.updatedAt = new Date();
  applyChapterAccessRequest(chapter, req.body, isAdmin(req.user));
  const pricingError = validateChapterPricing(chapter);
  if (pricingError) {
    throw httpError(400, pricingError);
  }

  if (isAdmin(req.user)) {
    markReviewed(chapter, "APPROVED", req.user, null);
  } else {
    markPending(chapter);
  }

  await chapter.save();
  if (
    isAdmin(req.user) &&
    previousStatus !== "APPROVED" &&
    isApprovedStatus(story.approvalStatus)
  ) {
    await sendNewChapterNotifications(story, chapter);
  }

  res.json(serializeDoc(chapter));
});

const regenerateChapterSummary = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findById(req.params.id);
  if (!chapter) {
    throw httpError(400, "LÃƒÂ¡Ã‚Â»ââ‚¬â€i: KhÃ„â€šÃ‚Â´ng tÃ„â€šÃ‚Â¬m thÃƒÂ¡Ã‚ÂºÃ‚Â¥y chÃƒâ€ Ã‚Â°Ãƒâ€ Ã‚Â¡ng!");
  }

  const story = await Story.findById(chapter.storyId).lean();
  if (!story) {
    throw httpError(400, "LÃƒÂ¡Ã‚Â»ââ‚¬â€i: KhÃ„â€šÃ‚Â´ng tÃ„â€šÃ‚Â¬m thÃƒÂ¡Ã‚ÂºÃ‚Â¥y truyÃƒÂ¡Ã‚Â»ââ‚¬Â¡n!");
  }

  chapter.summary = await generateSummary(serializeDoc(story), chapter);
  chapter.updatedAt = new Date();
  await chapter.save();

  res.json(serializeDoc(chapter));
});
/**
 * Cap nhat trang thai phe duyet cua chuong
 * Tu dong gui thong bao den theo doi neu chuong duoc phe duyet
 * @param {Object} req - Express request object, chua chapter ID trong params,  approvalStatus trong body
 * @param {Object} res - Express response object
 */const updateChapterApproval = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findById(req.params.id);
  if (!chapter) {
    throw httpError(400, "Lỗi: Không tìm thấy chương!");
  }

  const story = await Story.findById(chapter.storyId);
  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  const previousStatus = chapter.approvalStatus;
  chapter.updatedAt = new Date();
  markReviewed(chapter, req.body.approvalStatus, req.user, req.body.reviewNote);
  await chapter.save();

  if (
    String(req.body.approvalStatus).toUpperCase() === "APPROVED" &&
    previousStatus !== "APPROVED" &&
    isApprovedStatus(story.approvalStatus)
  ) {
    await sendNewChapterNotifications(story, chapter);
  }

  res.json(serializeDoc(chapter));
});
/**
 * Xoa chuong va xoa tat ca binh luan lien quan
 * @param {Object} req - Express request object, chua chapter ID trong params
 * @param {Object} res - Express response object
 */const deleteChapter = asyncHandler(async (req, res) => {
  const chapter = await Chapter.findById(req.params.id);
  if (!chapter) {
    throw httpError(400, "Lỗi: Không tìm thấy chương!");
  }

  const story = await Story.findById(chapter.storyId);
  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  if (!canManageStory(serializeDoc(story), req.user)) {
    throw httpError(403, "Lỗi: BáÂºÂ¡n khÄ‚Â´ng có quyáÂ»Ân xóa chương nÄ‚Â y.");
  }

  await chapter.deleteOne();
  res.json(buildMessage("Ã„ÂÄ‚Â£ xóa chương thành công!"));
});

module.exports = {
  listManageStoryChapters,
  listStoryChapters,
  listMyChapters,
  listReviewChapters,
  getChapterById,
  createChapter,
  updateChapter,
  regenerateChapterSummary,
  updateChapterApproval,
  deleteChapter,
};

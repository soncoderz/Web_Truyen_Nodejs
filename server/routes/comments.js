const express = require("express");
const Chapter = require("../models/chapter");
const Comment = require("../models/comment");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");
const { hasText } = require("../utils/normalize");
const {
  buildPublicProfileMap,
  hydrateCommentsWithProfiles,
} = require("../services/publicProfileService");

const router = express.Router();

async function enrichComments(comments) {
  const userIds = Array.from(
    new Set(
      comments
        .map((comment) => String(comment.userId || "").trim())
        .filter(Boolean),
    ),
  );

  if (userIds.length === 0) {
    return comments.map(serializeDoc);
  }

  const users = await User.find({ _id: { $in: userIds } }).lean();
  const profileMap = buildPublicProfileMap(users);
  return hydrateCommentsWithProfiles(comments, profileMap);
}

router.get(
  "/story/:storyId",
  asyncHandler(async (req, res) => {
    const comments = await Comment.find({ storyId: req.params.storyId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(await enrichComments(comments));
  }),
);

router.get(
  "/chapter/:chapterId",
  asyncHandler(async (req, res) => {
    const comments = await Comment.find({
      chapterId: req.params.chapterId,
      pageIndex: null,
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json(await enrichComments(comments));
  }),
);

router.get(
  "/chapter/:chapterId/page/:pageIndex",
  asyncHandler(async (req, res) => {
    const comments = await Comment.find({
      chapterId: req.params.chapterId,
      pageIndex: Number(req.params.pageIndex),
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json(await enrichComments(comments));
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    let chapterNumber = req.body.chapterNumber ?? null;

    if (hasText(req.body.chapterId)) {
      const chapter = await Chapter.findById(req.body.chapterId).lean();
      if (chapter) {
        chapterNumber = chapter.chapterNumber;
      }
    }

    if (!hasText(req.body.content) && !hasText(req.body.gifUrl)) {
      throw httpError(400, "Lỗi: Cần có nội dung bình luận hoặc GIF!");
    }

    if (req.body.gifSize && Number(req.body.gifSize) > 2 * 1024 * 1024) {
      throw httpError(400, "Lỗi: Kích thước GIF phải nhỏ hơn hoặc bằng 2MB!");
    }

    const comment = await Comment.create({
      storyId: req.body.storyId,
      chapterId: hasText(req.body.chapterId) ? req.body.chapterId.trim() : null,
      chapterNumber,
      pageIndex:
        req.body.pageIndex === undefined || req.body.pageIndex === null
          ? null
          : Number(req.body.pageIndex),
      userId: user.id,
      username: user.username,
      content: hasText(req.body.content) ? req.body.content : null,
      gifUrl: hasText(req.body.gifUrl) ? req.body.gifUrl : null,
      gifSize:
        req.body.gifSize === undefined || req.body.gifSize === null
          ? null
          : Number(req.body.gifSize),
    });

    res.json(serializeDoc(comment));
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      throw httpError(400, "Lỗi: Không tìm thấy bình luận!");
    }

    const isAdmin = req.user.roles?.includes("ROLE_ADMIN");
    if (!isAdmin && String(comment.userId) !== String(user.id)) {
      throw httpError(400, "Lỗi: Không có quyền thực hiện!");
    }

    await comment.deleteOne();
    res.json(buildMessage("Đã xóa bình luận thành công!"));
  }),
);

module.exports = router;

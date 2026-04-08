const { Reaction, VALID_EMOTIONS, VALID_TARGET_TYPES } = require("../models/reaction");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const {
  ensureArray,
  hasText,
  normalizeId,
  normalizeLong,
} = require("../utils/normalize");
const httpError = require("../utils/httpError");
const {
  buildSummaries,
  loadTargetSummary,
  loadTargetSummaryPair,
} = require("../services/reactionSummary");
const { emitReactionUpdated } = require("../config/socket");

function normalizeTargetType(value) {
  const targetType = String(value || "").trim().toUpperCase();
  if (!VALID_TARGET_TYPES.includes(targetType)) {
    throw httpError(400, "Invalid reaction target type.");
  }
  return targetType;
}

function normalizeEmotion(value) {
  if (!hasText(value)) {
    return null;
  }

  const emotion = String(value).trim().toUpperCase();
  if (!VALID_EMOTIONS.includes(emotion)) {
    throw httpError(400, "Invalid reaction emotion.");
  }

  return emotion;
}

function normalizeTargetId(value) {
  const targetId = normalizeId(value);
  if (!targetId) {
    throw httpError(400, "Reaction target id is required.");
  }

  return targetId;
}

function normalizeTargetPayload(input) {
  const targetType = normalizeTargetType(input?.targetType);
  const targetId = normalizeTargetId(input?.targetId);

  return {
    targetType,
    targetId,
  };
}

/**
 * Lay tong hop cam xuc (like, love, etc) cua nguoi dung hien tai cho mot doi tuong
 * @param {Object} req - Express request object, chua targetType va targetId trong query
 * @param {Object} res - Express response object
 */
const getSummary = asyncHandler(async (req, res) => {
  const targetType = normalizeTargetType(req.query.targetType);
  const targetId = normalizeTargetId(req.query.targetId);
  const summary = await loadTargetSummary(
    targetType,
    targetId,
    req.user?.id || null,
  );
  res.json(summary);
});

/**
 * Lay tong hop cam xuc cho nhieu doi tuong cung luc
 * @param {Object} req - Express request object, chua mang targets trong body
 * @param {Object} res - Express response object
 */
const getBatchSummary = asyncHandler(async (req, res) => {
  const targets = ensureArray(req.body?.targets)
    .slice(0, 1000)
    .map(normalizeTargetPayload);

  if (targets.length === 0) {
    return res.json([]);
  }

  const reactions = await Reaction.find({
    $or: targets.map(({ targetType, targetId }) => ({
      targetType,
      targetId,
    })),
  }).lean();

  return res.json(buildSummaries(targets, reactions, req.user?.id || null));
});

// Thiết lập, thay đổi hoặc hủy bỏ cảm xúc (Reaction) của một User lên Truyện/Chương
const setReaction = asyncHandler(async (req, res) => {
  // 1. Phân tích Token JWT để lấy User đang thực hiện hành động
  const user = await getCurrentUserDocument(req);
  
  // 2. Chắt lọc và chuẩn hóa dữ liệu Payload gửi lên (Loại đối tượng, ID, Cảm xúc)
  const targetType = normalizeTargetType(req.body?.targetType);
  const targetId = normalizeTargetId(req.body?.targetId);
  const emotion = normalizeEmotion(req.body?.emotion);
  
  // 3. Khởi tạo Query lọc kết quả trong Database
  const filter = {
    userId: user.id,
    targetType,
    targetId,
  };

  // Tra cứu dữ liệu quá khứ: xem User này từng thả biểu tượng nào lên Đối tượng này chưa
  const existingReaction = await Reaction.findOne(filter);

  // KỊCH BẢN A: Người dùng đang gửi yêu cầu "Bỏ like/Hủy cảm xúc" (emotion == null)
  if (!emotion) {
    if (existingReaction) {
      // Xóa đối tượng cảm xúc cũ khỏi hệ thống cơ sở dữ liệu
      await existingReaction.deleteOne();
    }

    // Tính toán lại Tổng lượt tính của hệ thống ngay lập tức
    const { publicSummary, viewerSummary } = await loadTargetSummaryPair(
      targetType,
      targetId,
      user.id,
    );

    // Bắn sự kiện Socket Realtime đi các máy client khác dể giảm số lượng Like mà không cần reset page
    emitReactionUpdated({
      targetType,
      targetId,
      summary: publicSummary,
      actorUserId: user.id,
      actorEmotion: null,
    });

    return res.json({
      summary: viewerSummary,
    });
  }

  // KỊCH BẢN B: Người dùng đang gửi yêu cầu Cập nhật hoặc Thêm mới cảm xúc
  // Gom cấu trúc dữ liệu chuẩn chuẩn bị lưu xuống Database
  const payload = {
    userId: user.id,
    targetType,
    targetId,
    emotion,
    storyId: normalizeId(req.body?.storyId),
    chapterId: normalizeId(req.body?.chapterId),
    pageIndex:
      req.body?.pageIndex === undefined || req.body?.pageIndex === null
        ? null
        : normalizeLong(req.body.pageIndex, null),
    paragraphIndex:
      req.body?.paragraphIndex === undefined || req.body?.paragraphIndex === null
        ? null
        : normalizeLong(req.body.paragraphIndex, null),
    updatedAt: new Date(),
  };

  // Xử lý lưu kết quả
  if (existingReaction) {
    // Nếu trước kia đã Like rồi mà giờ đổi càm xúc -> Tiến hành Update giá trị cũ và Save() lại
    existingReaction.emotion = payload.emotion;
    existingReaction.storyId = payload.storyId;
    existingReaction.chapterId = payload.chapterId;
    existingReaction.pageIndex = payload.pageIndex;
    existingReaction.paragraphIndex = payload.paragraphIndex;
    existingReaction.updatedAt = payload.updatedAt;
    await existingReaction.save();
  } else {
    // Nếu chưa từng thả cảm xúc trước bao giờ -> Tạo hẳn Document mới (Create)
    await Reaction.create({
      ...payload,
      createdAt: new Date(),
    });
  }

  // Tính thống kê đếm tổng số mới
  const { publicSummary, viewerSummary } = await loadTargetSummaryPair(
    targetType,
    targetId,
    user.id,
  );

  // Kích hoạt tín hiệu Socket Push thông báo có cảm xúc mới
  emitReactionUpdated({
    targetType,
    targetId,
    summary: publicSummary,
    actorUserId: user.id,
    actorEmotion: emotion,
  });

  // Trả về JSON thành công cho trình duyệt gọi lệnh
  return res.json({
    summary: viewerSummary,
  });
});

module.exports = {
  getSummary,
  getBatchSummary,
  setReaction,
};

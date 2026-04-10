const ReadingHistory = require("../models/readingHistory");
const asyncHandler = require("../utils/asyncHandler");
const { trackChapterRead } = require("../services/rewardService");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const { normalizeId } = require("../utils/normalize");

function normalizeNote(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 4000 ? normalized.slice(0, 4000) : normalized;
}

/**
 * Lay danh sach ich su doc cua nguoi dung hien tai
 * Sap xep theo thu tu doc gan day nhat
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listReadingHistory = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const history = await ReadingHistory.find({ userId: user.id })
    .sort({ lastReadAt: -1 })
    .lean();
  res.json(history.map(serializeDoc));
});

/**
 * Lay lich su doc cua nguoi dung cho mot truyen
 * @param {Object} req - Express request object, chua storyId trong params
 * @param {Object} res - Express response object
 */
const getStoryReadingHistory = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const history = await ReadingHistory.findOne({
    userId: user.id,
    storyId: req.params.storyId,
  }).lean();
  res.json(history ? serializeDoc(history) : null);
});

// Cap nhat hoac tao moi lich su doc - theo doi chapter read va phan thuong mission
// Cau truc: luu thong tin chapter dang doc, thoi gian doc goi nhat, ghi chu tu do
// Chi can gui storyId, chapterId - he thong tu dong tao hoac cap nhat record
const upsertReadingHistory = asyncHandler(async (req, res) => {
  // 1. Lay thong tin user hien tai
  const user = await getCurrentUserDocument(req);
  
  // 2. Chuyen doi input data - normalizeId va normalizeNote loai bo trang, ki tu dac biet
  const storyId = normalizeId(req.body.storyId);
  const chapterId = normalizeId(req.body.chapterId);
  const note = normalizeNote(req.body.note);
  
  // 3. Theo doi chapter doc: kiem tra mission & reward (nang cap diem, thuong xu, medal...)
  const mission = trackChapterRead(user, chapterId, new Date());

  // 4. KỊCH BẢN A: Cap nhat - neu reading history cua story nay da ton tai
  // KỊCH BẢN B: Tao moi - neu la lan dau doc chuyen, tao record moi
  const history = await ReadingHistory.findOneAndUpdate(
    { userId: user.id, storyId },
    {
      // Cap nhat: chapter ID hien tai, thoi gian doc goi nhat (LAST_READ_AT)
      $set: {
        chapterId,
        lastReadAt: new Date(),
        // Neu client gui note thi cap nhat, ki khong thi giu note cu
        ...(req.body.note !== undefined ? { note } : {}),
      },
      // Tao moi: dat userId va storyId khi upsert
      $setOnInsert: {
        userId: user.id,
        storyId,
      },
    },
    { new: true, upsert: true },
  );

  // 5. Luu lai user sau khi cap nhat reward state (mission, coin, medal...)
  await user.save();

  // 6. Tra ve reading history sau khi cap nhat, kem theo mission reward info
  res.json({
    ...serializeDoc(history),
    mission,
  });
});
/**
 * Xoa mot ban ghi lich su doc
 * @param {Object} req - Express request object, chua reading history ID trong params
 * @param {Object} res - Express response object
 */const deleteReadingHistory = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  await ReadingHistory.deleteOne({ _id: req.params.id, userId: user.id });
  res.json(buildMessage("Đã xóa lịch sử!"));
});

module.exports = {
  listReadingHistory,
  getStoryReadingHistory,
  upsertReadingHistory,
  deleteReadingHistory,
};

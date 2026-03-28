const express = require("express");
const Chapter = require("../models/chapter");
const ReaderNote = require("../models/readerNote");
const Story = require("../models/story");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");
const { normalizeId } = require("../utils/normalize");

const router = express.Router();

function extractParagraphs(content) {
  if (!content || !String(content).trim()) {
    return [];
  }

  const normalized = String(content).replace(/\r\n/g, "\n").trim();
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length > 0) {
    return blocks;
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeNote(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 4000 ? normalized.slice(0, 4000) : normalized;
}

async function resolveContext(storyId, chapterId) {
  const normalizedStoryId = normalizeId(storyId);
  const normalizedChapterId = normalizeId(chapterId);

  if (!normalizedStoryId) {
    throw httpError(400, "Lỗi: Bắt buộc phải có truyện.");
  }

  if (!normalizedChapterId) {
    throw httpError(400, "Lỗi: Bắt buộc phải có chương.");
  }

  const [story, chapter] = await Promise.all([
    Story.findById(normalizedStoryId).lean(),
    Chapter.findById(normalizedChapterId).lean(),
  ]);

  if (!story) {
    throw httpError(400, "Lỗi: Không tìm thấy truyện!");
  }

  if (!chapter) {
    throw httpError(400, "Lỗi: Không tìm thấy chương!");
  }

  if (String(chapter.storyId) !== normalizedStoryId) {
    throw httpError(400, "Lỗi: Chương không thuộc truyện này.");
  }

  return { story: serializeDoc(story), chapter: serializeDoc(chapter) };
}

function validateLocation(story, chapter, pageIndex, paragraphIndex) {
  if (story.type === "MANGA") {
    if (paragraphIndex !== undefined && paragraphIndex !== null) {
      return "Lỗi: Ghi chú manga phải trỏ đến một trang.";
    }
    if (pageIndex === undefined || pageIndex === null) {
      return "Lỗi: Ghi chú manga bắt buộc phải có trang.";
    }
    if (pageIndex < 0 || pageIndex >= (chapter.pages || []).length) {
      return "Lỗi: Chỉ số trang vượt ngoài phạm vi.";
    }
    return null;
  }

  if (pageIndex !== undefined && pageIndex !== null) {
    return "Lỗi: Ghi chú novel phải trỏ đến một đoạn.";
  }

  if (paragraphIndex === undefined || paragraphIndex === null) {
    return "Lỗi: Ghi chú novel bắt buộc phải có đoạn.";
  }

  const paragraphs = extractParagraphs(chapter.content);
  if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
    return "Lỗi: Chỉ số đoạn vượt ngoài phạm vi.";
  }

  return null;
}

router.get(
  "/story/:storyId/chapter/:chapterId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const { story, chapter } = await resolveContext(
      req.params.storyId,
      req.params.chapterId,
    );

    const notes = await ReaderNote.find({
      userId: user.id,
      storyId: story.id,
      chapterId: chapter.id,
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.json(notes.map(serializeDoc));
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const note = normalizeNote(req.body.note);
    const pageIndex =
      req.body.pageIndex === undefined || req.body.pageIndex === null
        ? null
        : Number(req.body.pageIndex);
    const paragraphIndex =
      req.body.paragraphIndex === undefined || req.body.paragraphIndex === null
        ? null
        : Number(req.body.paragraphIndex);

    if (!note) {
      throw httpError(400, "Lỗi: Bắt buộc phải có ghi chú.");
    }

    if (pageIndex !== null && paragraphIndex !== null) {
      throw httpError(400, "Lỗi: Ghi chú chỉ có thể trỏ đến một trang hoặc một đoạn.");
    }

    if (pageIndex === null && paragraphIndex === null) {
      throw httpError(400, "Lỗi: Ghi chú bắt buộc phải có trang hoặc đoạn.");
    }

    const { story, chapter } = await resolveContext(req.body.storyId, req.body.chapterId);
    const locationError = validateLocation(story, chapter, pageIndex, paragraphIndex);
    if (locationError) {
      throw httpError(400, locationError);
    }

    const savedNote = await ReaderNote.findOneAndUpdate(
      {
        userId: user.id,
        storyId: story.id,
        chapterId: chapter.id,
        pageIndex,
        paragraphIndex,
      },
      {
        $set: {
          note,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId: user.id,
          storyId: story.id,
          chapterId: chapter.id,
          pageIndex,
          paragraphIndex,
        },
      },
      { new: true, upsert: true },
    );

    res.json(serializeDoc(savedNote));
  }),
);

router.delete(
  "/story/:storyId/chapter/:chapterId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const pageIndex =
      req.query.pageIndex === undefined || req.query.pageIndex === null
        ? null
        : Number(req.query.pageIndex);
    const paragraphIndex =
      req.query.paragraphIndex === undefined || req.query.paragraphIndex === null
        ? null
        : Number(req.query.paragraphIndex);

    const { story, chapter } = await resolveContext(
      req.params.storyId,
      req.params.chapterId,
    );
    const locationError = validateLocation(story, chapter, pageIndex, paragraphIndex);
    if (locationError) {
      throw httpError(400, locationError);
    }

    await ReaderNote.deleteOne({
      userId: user.id,
      storyId: story.id,
      chapterId: chapter.id,
      pageIndex,
      paragraphIndex,
    });

    res.json(buildMessage("Đã xóa ghi chú thành công!"));
  }),
);

module.exports = router;

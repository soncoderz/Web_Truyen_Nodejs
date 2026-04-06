const Chapter = require("../models/chapter");
const ReaderNote = require("../models/readerNote");
const Story = require("../models/story");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");
const { normalizeId } = require("../utils/normalize");

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
    throw httpError(400, "Lá»—i: Báº¯t buá»™c pháº£i cÃ³ truyá»‡n.");
  }

  if (!normalizedChapterId) {
    throw httpError(400, "Lá»—i: Báº¯t buá»™c pháº£i cÃ³ chÆ°Æ¡ng.");
  }

  const [story, chapter] = await Promise.all([
    Story.findById(normalizedStoryId).lean(),
    Chapter.findById(normalizedChapterId).lean(),
  ]);

  if (!story) {
    throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y truyá»‡n!");
  }

  if (!chapter) {
    throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng!");
  }

  if (String(chapter.storyId) !== normalizedStoryId) {
    throw httpError(400, "Lá»—i: ChÆ°Æ¡ng khÃ´ng thuá»™c truyá»‡n nÃ y.");
  }

  return { story: serializeDoc(story), chapter: serializeDoc(chapter) };
}

function validateLocation(story, chapter, pageIndex, paragraphIndex) {
  if (story.type === "MANGA") {
    if (paragraphIndex !== undefined && paragraphIndex !== null) {
      return "Lá»—i: Ghi chÃº manga pháº£i trá» Ä‘áº¿n má»™t trang.";
    }
    if (pageIndex === undefined || pageIndex === null) {
      return "Lá»—i: Ghi chÃº manga báº¯t buá»™c pháº£i cÃ³ trang.";
    }
    if (pageIndex < 0 || pageIndex >= (chapter.pages || []).length) {
      return "Lá»—i: Chá»‰ sá»‘ trang vÆ°á»£t ngoÃ i pháº¡m vi.";
    }
    return null;
  }

  if (pageIndex !== undefined && pageIndex !== null) {
    return "Lá»—i: Ghi chÃº novel pháº£i trá» Ä‘áº¿n má»™t Ä‘oáº¡n.";
  }

  if (paragraphIndex === undefined || paragraphIndex === null) {
    return "Lá»—i: Ghi chÃº novel báº¯t buá»™c pháº£i cÃ³ Ä‘oáº¡n.";
  }

  const paragraphs = extractParagraphs(chapter.content);
  if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
    return "Lá»—i: Chá»‰ sá»‘ Ä‘oáº¡n vÆ°á»£t ngoÃ i pháº¡m vi.";
  }

  return null;
}

const listReaderNotes = asyncHandler(async (req, res) => {
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
});

const upsertReaderNote = asyncHandler(async (req, res) => {
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
    throw httpError(400, "Lá»—i: Báº¯t buá»™c pháº£i cÃ³ ghi chÃº.");
  }

  if (pageIndex !== null && paragraphIndex !== null) {
    throw httpError(
      400,
      "Lá»—i: Ghi chÃº chá»‰ cÃ³ thá»ƒ trá» Ä‘áº¿n má»™t trang hoáº·c má»™t Ä‘oáº¡n.",
    );
  }

  if (pageIndex === null && paragraphIndex === null) {
    throw httpError(400, "Lá»—i: Ghi chÃº báº¯t buá»™c pháº£i cÃ³ trang hoáº·c Ä‘oáº¡n.");
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
});

const deleteReaderNote = asyncHandler(async (req, res) => {
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

  res.json(buildMessage("ÄÃ£ xÃ³a ghi chÃº thÃ nh cÃ´ng!"));
});

module.exports = {
  listReaderNotes,
  upsertReaderNote,
  deleteReaderNote,
};

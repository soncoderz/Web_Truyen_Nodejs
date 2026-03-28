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
    throw httpError(400, "Error: Story is required.");
  }

  if (!normalizedChapterId) {
    throw httpError(400, "Error: Chapter is required.");
  }

  const [story, chapter] = await Promise.all([
    Story.findById(normalizedStoryId).lean(),
    Chapter.findById(normalizedChapterId).lean(),
  ]);

  if (!story) {
    throw httpError(400, "Error: Story not found!");
  }

  if (!chapter) {
    throw httpError(400, "Error: Chapter not found!");
  }

  if (String(chapter.storyId) !== normalizedStoryId) {
    throw httpError(400, "Error: Chapter does not belong to this story.");
  }

  return { story: serializeDoc(story), chapter: serializeDoc(chapter) };
}

function validateLocation(story, chapter, pageIndex, paragraphIndex) {
  if (story.type === "MANGA") {
    if (paragraphIndex !== undefined && paragraphIndex !== null) {
      return "Error: Manga notes must target a page.";
    }
    if (pageIndex === undefined || pageIndex === null) {
      return "Error: Page is required for manga notes.";
    }
    if (pageIndex < 0 || pageIndex >= (chapter.pages || []).length) {
      return "Error: Page index is out of range.";
    }
    return null;
  }

  if (pageIndex !== undefined && pageIndex !== null) {
    return "Error: Novel notes must target a paragraph.";
  }

  if (paragraphIndex === undefined || paragraphIndex === null) {
    return "Error: Paragraph is required for novel notes.";
  }

  const paragraphs = extractParagraphs(chapter.content);
  if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
    return "Error: Paragraph index is out of range.";
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
      throw httpError(400, "Error: Note is required.");
    }

    if (pageIndex !== null && paragraphIndex !== null) {
      throw httpError(400, "Error: Note can only target a page or a paragraph.");
    }

    if (pageIndex === null && paragraphIndex === null) {
      throw httpError(400, "Error: Page or paragraph is required for note.");
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

    res.json(buildMessage("Note deleted successfully!"));
  }),
);

module.exports = router;

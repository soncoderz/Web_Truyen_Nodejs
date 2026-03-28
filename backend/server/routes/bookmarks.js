const express = require("express");
const Bookmark = require("../models/bookmark");
const Chapter = require("../models/chapter");
const Story = require("../models/story");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const { canViewStory, isApprovedStatus } = require("../utils/permissions");
const { ensureArray } = require("../utils/normalize");
const { serializeBookmarkResponse } = require("../services/hydrationService");
const httpError = require("../utils/httpError");

const router = express.Router();

function normalizeId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeNote(note) {
  if (note === undefined || note === null) {
    return null;
  }

  const normalized = String(note).trim();
  return normalized || null;
}

function normalizeTextSnippet(textSnippet) {
  if (textSnippet === undefined || textSnippet === null) {
    return null;
  }

  const normalized = String(textSnippet).replace(/\r/g, " ").replace(/\n/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 240 ? normalized.slice(0, 240) : normalized;
}

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

function buildTextSnippet(paragraph) {
  const normalized = String(paragraph || "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();

  return normalized.length <= 140 ? normalized : `${normalized.slice(0, 140)}...`;
}

function bookmarkPriority(bookmark) {
  let priority = 0;
  if (bookmark.pageIndex !== null && bookmark.pageIndex !== undefined) {
    priority += 4;
  }
  if (bookmark.paragraphIndex !== null && bookmark.paragraphIndex !== undefined) {
    priority += 4;
  }
  if (normalizeId(bookmark.chapterId)) {
    priority += 2;
  }
  if (bookmark.textSnippet) {
    priority += 1;
  }
  return priority;
}

function bookmarkComparator(left, right) {
  const priorityDiff = bookmarkPriority(right) - bookmarkPriority(left);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
}

function pickPrimaryBookmark(bookmarks) {
  return ensureArray(bookmarks).slice().sort(bookmarkComparator)[0] || null;
}

function normalizeBookmarks(bookmarks) {
  const grouped = new Map();

  for (const bookmark of ensureArray(bookmarks)) {
    const storyId = String(bookmark.storyId);
    if (!grouped.has(storyId)) {
      grouped.set(storyId, []);
    }
    grouped.get(storyId).push(bookmark);
  }

  return Array.from(grouped.values())
    .map((storyBookmarks) => pickPrimaryBookmark(storyBookmarks))
    .filter(Boolean)
    .sort(bookmarkComparator);
}

function findMatchingBookmarks(storyBookmarks, chapterId, pageIndex, paragraphIndex) {
  return ensureArray(storyBookmarks).filter(
    (bookmark) =>
      normalizeId(bookmark.chapterId) === chapterId &&
      bookmark.pageIndex === pageIndex &&
      bookmark.paragraphIndex === paragraphIndex,
  );
}

function canViewChapterForBookmark(chapter, story, currentUser) {
  return (
    canViewStory(story, currentUser) &&
    (isApprovedStatus(chapter.approvalStatus) || story.uploaderId === currentUser?.id || currentUser?.roles?.includes("ROLE_ADMIN"))
  );
}

async function toBookmarkResponse(bookmark, currentUser) {
  const storyDocument = await Story.findById(bookmark.storyId).lean();
  const story =
    storyDocument && canViewStory(serializeDoc(storyDocument), currentUser)
      ? serializeDoc(storyDocument)
      : null;

  let chapter = null;
  const chapterId = normalizeId(bookmark.chapterId);
  if (story && chapterId) {
    const chapterDocument = await Chapter.findById(chapterId).lean();
    if (chapterDocument && canViewChapterForBookmark(serializeDoc(chapterDocument), story, currentUser)) {
      chapter = serializeDoc(chapterDocument);
    }
  }

  return serializeBookmarkResponse(serializeDoc(bookmark), story, chapter);
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const bookmarks = await Bookmark.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .lean();

    const normalized = normalizeBookmarks(bookmarks);
    const responses = [];
    for (const bookmark of normalized) {
      responses.push(await toBookmarkResponse(bookmark, req.user));
    }

    res.json(responses);
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const storyDocument = await Story.findById(req.body.storyId).lean();
    if (!storyDocument) {
      throw httpError(400, "Error: Story not found!");
    }

    const story = serializeDoc(storyDocument);
    if (!canViewStory(story, req.user)) {
      throw httpError(403, "Error: You do not have permission to bookmark this story.");
    }

    const normalizedChapterId = normalizeId(req.body.chapterId);
    const normalizedPageIndex =
      req.body.pageIndex === undefined || req.body.pageIndex === null
        ? null
        : Number(req.body.pageIndex);
    const normalizedParagraphIndex =
      req.body.paragraphIndex === undefined || req.body.paragraphIndex === null
        ? null
        : Number(req.body.paragraphIndex);
    const normalizedTextSnippet = normalizeTextSnippet(req.body.textSnippet);
    let normalizedNote = normalizeNote(req.body.note);

    if (normalizedPageIndex !== null && normalizedParagraphIndex !== null) {
      throw httpError(400, "Error: Bookmark can only target a page or a paragraph.");
    }

    if (
      (normalizedPageIndex !== null ||
        normalizedParagraphIndex !== null ||
        normalizedTextSnippet !== null) &&
      !normalizedChapterId
    ) {
      throw httpError(400, "Error: Chapter is required for page or paragraph bookmarks.");
    }

    if (normalizedTextSnippet !== null && normalizedParagraphIndex === null) {
      throw httpError(400, "Error: Paragraph index is required when saving text snippet.");
    }

    if (story.type === "MANGA") {
      if (normalizedParagraphIndex !== null || normalizedTextSnippet !== null) {
        throw httpError(400, "Error: Manga bookmarks must target a page.");
      }
    } else if (normalizedPageIndex !== null) {
      throw httpError(400, "Error: Novel bookmarks must target a paragraph.");
    }

    let chapter = null;
    if (normalizedChapterId) {
      const chapterDocument = await Chapter.findById(normalizedChapterId).lean();
      if (!chapterDocument) {
        throw httpError(400, "Error: Chapter not found!");
      }

      if (String(chapterDocument.storyId) !== story.id) {
        throw httpError(400, "Error: Chapter does not belong to this story.");
      }

      if (!isApprovedStatus(chapterDocument.approvalStatus) && !canViewStory(story, req.user)) {
        throw httpError(403, "Error: You do not have permission to bookmark this chapter.");
      }

      chapter = serializeDoc(chapterDocument);

      if (!canViewChapterForBookmark(chapter, story, req.user)) {
        throw httpError(403, "Error: You do not have permission to bookmark this chapter.");
      }

      if (normalizedPageIndex !== null) {
        if (normalizedPageIndex < 0 || normalizedPageIndex >= ensureArray(chapter.pages).length) {
          throw httpError(400, "Error: Page index is out of range.");
        }

        if (normalizedNote === null) {
          normalizedNote = `Trang ${normalizedPageIndex + 1}`;
        }
      }

      if (normalizedParagraphIndex !== null) {
        const paragraphs = extractParagraphs(chapter.content);
        if (
          normalizedParagraphIndex < 0 ||
          normalizedParagraphIndex >= paragraphs.length
        ) {
          throw httpError(400, "Error: Paragraph index is out of range.");
        }

        if (normalizedNote === null) {
          normalizedNote = `Doan ${normalizedParagraphIndex + 1}`;
        }
      }
    }

    const storyBookmarks = await Bookmark.find({
      userId: user.id,
      storyId: req.body.storyId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const matchingBookmarks = findMatchingBookmarks(
      storyBookmarks,
      normalizedChapterId,
      normalizedPageIndex,
      normalizedParagraphIndex,
    );

    let existing = pickPrimaryBookmark(matchingBookmarks);
    if (!existing) {
      existing = pickPrimaryBookmark(storyBookmarks);
    }

    let bookmark;
    if (existing) {
      bookmark = await Bookmark.findById(existing.id || existing._id);
      bookmark.chapterId = normalizedChapterId;
      bookmark.pageIndex = normalizedPageIndex;
      bookmark.paragraphIndex = normalizedParagraphIndex;
      bookmark.textSnippet =
        normalizedTextSnippet ??
        (normalizedParagraphIndex !== null && chapter
          ? buildTextSnippet(extractParagraphs(chapter.content)[normalizedParagraphIndex])
          : null);
      bookmark.note = normalizedNote;
      await bookmark.save();

      await Bookmark.deleteMany({
        userId: user.id,
        storyId: req.body.storyId,
        _id: { $ne: bookmark._id },
      });
    } else {
      bookmark = await Bookmark.create({
        userId: user.id,
        storyId: req.body.storyId,
        chapterId: normalizedChapterId,
        pageIndex: normalizedPageIndex,
        paragraphIndex: normalizedParagraphIndex,
        textSnippet:
          normalizedTextSnippet ??
          (normalizedParagraphIndex !== null && chapter
            ? buildTextSnippet(extractParagraphs(chapter.content)[normalizedParagraphIndex])
            : null),
        note: normalizedNote,
      });
    }

    res.json(await toBookmarkResponse(bookmark, req.user));
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    const bookmark = await Bookmark.findById(req.params.id);
    if (!bookmark) {
      throw httpError(400, "Error: Bookmark not found!");
    }

    if (String(bookmark.userId) !== String(user.id)) {
      throw httpError(403, "Error: You do not have permission to delete this bookmark.");
    }

    await Bookmark.deleteMany({
      userId: user.id,
      storyId: bookmark.storyId,
    });

    res.json(buildMessage("Bookmark deleted successfully!"));
  }),
);

module.exports = router;

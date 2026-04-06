const Bookmark = require("../models/bookmark");
const Chapter = require("../models/chapter");
const Story = require("../models/story");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const { canViewStory, isApprovedStatus } = require("../utils/permissions");
const { ensureArray } = require("../utils/normalize");
const { serializeBookmarkResponse } = require("../services/hydrationService");
const httpError = require("../utils/httpError");

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

  const normalized = String(textSnippet)
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();
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

  return (
    new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
  );
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
    (isApprovedStatus(chapter.approvalStatus) ||
      story.uploaderId === currentUser?.id ||
      currentUser?.roles?.includes("ROLE_ADMIN"))
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
    if (
      chapterDocument &&
      canViewChapterForBookmark(serializeDoc(chapterDocument), story, currentUser)
    ) {
      chapter = serializeDoc(chapterDocument);
    }
  }

  return serializeBookmarkResponse(serializeDoc(bookmark), story, chapter);
}

const listBookmarks = asyncHandler(async (req, res) => {
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
});

const upsertBookmark = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const storyDocument = await Story.findById(req.body.storyId).lean();
  if (!storyDocument) {
    throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y truyá»‡n!");
  }

  const story = serializeDoc(storyDocument);
  if (!canViewStory(story, req.user)) {
    throw httpError(403, "Lá»—i: Báº¡n khÃ´ng cÃ³ quyá»n bookmark truyá»‡n nÃ y.");
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
    throw httpError(
      400,
      "Lá»—i: Bookmark chá»‰ cÃ³ thá»ƒ trá» Ä‘áº¿n má»™t trang hoáº·c má»™t Ä‘oáº¡n.",
    );
  }

  if (
    (normalizedPageIndex !== null ||
      normalizedParagraphIndex !== null ||
      normalizedTextSnippet !== null) &&
    !normalizedChapterId
  ) {
    throw httpError(400, "Lá»—i: Cáº§n cÃ³ chÆ°Æ¡ng cho bookmark theo trang hoáº·c Ä‘oáº¡n.");
  }

  if (normalizedTextSnippet !== null && normalizedParagraphIndex === null) {
    throw httpError(400, "Lá»—i: Cáº§n cÃ³ chá»‰ sá»‘ Ä‘oáº¡n khi lÆ°u trÃ­ch Ä‘oáº¡n vÄƒn báº£n.");
  }

  if (story.type === "MANGA") {
    if (normalizedParagraphIndex !== null || normalizedTextSnippet !== null) {
      throw httpError(400, "Lá»—i: Bookmark manga pháº£i trá» Ä‘áº¿n má»™t trang.");
    }
  } else if (normalizedPageIndex !== null) {
    throw httpError(400, "Lá»—i: Bookmark novel pháº£i trá» Ä‘áº¿n má»™t Ä‘oáº¡n.");
  }

  let chapter = null;
  if (normalizedChapterId) {
    const chapterDocument = await Chapter.findById(normalizedChapterId).lean();
    if (!chapterDocument) {
      throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng!");
    }

    if (String(chapterDocument.storyId) !== story.id) {
      throw httpError(400, "Lá»—i: ChÆ°Æ¡ng khÃ´ng thuá»™c truyá»‡n nÃ y.");
    }

    if (
      !isApprovedStatus(chapterDocument.approvalStatus) &&
      !canViewStory(story, req.user)
    ) {
      throw httpError(403, "Lá»—i: Báº¡n khÃ´ng cÃ³ quyá»n bookmark chÆ°Æ¡ng nÃ y.");
    }

    chapter = serializeDoc(chapterDocument);

    if (!canViewChapterForBookmark(chapter, story, req.user)) {
      throw httpError(403, "Lá»—i: Báº¡n khÃ´ng cÃ³ quyá»n bookmark chÆ°Æ¡ng nÃ y.");
    }

    if (normalizedPageIndex !== null) {
      if (normalizedPageIndex < 0 || normalizedPageIndex >= ensureArray(chapter.pages).length) {
        throw httpError(400, "Lá»—i: Chá»‰ sá»‘ trang vÆ°á»£t ngoÃ i pháº¡m vi.");
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
        throw httpError(400, "Lá»—i: Chá»‰ sá»‘ Ä‘oáº¡n vÆ°á»£t ngoÃ i pháº¡m vi.");
      }

      if (normalizedNote === null) {
        normalizedNote = `Äoáº¡n ${normalizedParagraphIndex + 1}`;
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
});

const deleteBookmark = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const bookmark = await Bookmark.findById(req.params.id);
  if (!bookmark) {
    throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y bookmark!");
  }

  if (String(bookmark.userId) !== String(user.id)) {
    throw httpError(403, "Lá»—i: Báº¡n khÃ´ng cÃ³ quyá»n xÃ³a bookmark nÃ y.");
  }

  await Bookmark.deleteMany({
    userId: user.id,
    storyId: bookmark.storyId,
  });

  res.json(buildMessage("ÄÃ£ xÃ³a bookmark thÃ nh cÃ´ng!"));
});

module.exports = {
  listBookmarks,
  upsertBookmark,
  deleteBookmark,
};

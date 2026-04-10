const Author = require("../models/author");
const Category = require("../models/category");
const Role = require("../models/role");
const { extractDbRefIds } = require("../utils/dbRefs");
const { serializeDoc } = require("../utils/serialize");
const { ensureArray } = require("../utils/normalize");

// Tao map id -> document de hydrate du lieu nhanh hon.
function mapById(documents) {
  return new Map(documents.map((doc) => [doc.id, doc]));
}

// Tu DBRef/id, tai document that va tra ve theo thu tu ids dau vao.
async function resolveReferencedDocuments(values, Model) {
  const ids = Array.from(new Set(extractDbRefIds(values)));
  if (ids.length === 0) {
    return [];
  }

  const documents = await Model.find({ _id: { $in: ids } }).lean();
  const serialized = documents.map(serializeDoc);
  const byId = mapById(serialized);

  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// Hydrate mot story don le voi category va author dang o dang tham chieu.
async function hydrateStory(story) {
  const plainStory = serializeDoc(story);
  plainStory.categories = await resolveReferencedDocuments(
    story.categories,
    Category,
  );
  plainStory.authors = await resolveReferencedDocuments(story.authors, Author);
  return plainStory;
}

// Phien ban toi uu cho danh sach story: query authors/categories theo lo.
async function hydrateStories(stories) {
  const storyList = ensureArray(stories).map(serializeDoc);
  const categoryIds = Array.from(
    new Set(storyList.flatMap((story) => extractDbRefIds(story.categories))),
  );
  const authorIds = Array.from(
    new Set(storyList.flatMap((story) => extractDbRefIds(story.authors))),
  );

  const [categories, authors] = await Promise.all([
    categoryIds.length
      ? Category.find({ _id: { $in: categoryIds } }).lean()
      : Promise.resolve([]),
    authorIds.length
      ? Author.find({ _id: { $in: authorIds } }).lean()
      : Promise.resolve([]),
  ]);

  const categoryMap = mapById(categories.map(serializeDoc));
  const authorMap = mapById(authors.map(serializeDoc));

  return storyList.map((story) => ({
    ...story,
    categories: extractDbRefIds(story.categories)
      .map((id) => categoryMap.get(id))
      .filter(Boolean),
    authors: extractDbRefIds(story.authors)
      .map((id) => authorMap.get(id))
      .filter(Boolean),
  }));
}

// Rut chapter ve payload gon cho danh sach va response API.
function serializeChapterListItem(chapter, extra = {}) {
  const plainChapter = serializeDoc(chapter);
  return {
    id: plainChapter.id,
    storyId: plainChapter.storyId,
    chapterNumber: plainChapter.chapterNumber,
    title: plainChapter.title,
    summary: plainChapter.summary || null,
    accessMode: plainChapter.accessMode || "FREE",
    accessPrice: plainChapter.accessPrice || 0,
    createdAt: plainChapter.createdAt,
    updatedAt: plainChapter.updatedAt,
    ...extra,
  };
}

// Chuan hoa response dang nhap/JWT de frontend doc nhat quan.
function serializeJwtResponse({ token, user, roles }) {
  return {
    accessToken: token,
    token,
    tokenType: "Bearer",
    type: "Bearer",
    id: user.id,
    username: user.username,
    email: user.email,
    roles,
    avatar: user.avatar || null,
  };
}

// Gop bookmark voi story/chapter lien quan neu co de frontend dung ngay.
function serializeBookmarkResponse(bookmark, story, chapter) {
  return {
    id: bookmark.id,
    userId: bookmark.userId,
    storyId: bookmark.storyId,
    chapterId: bookmark.chapterId || null,
    pageIndex: bookmark.pageIndex ?? null,
    paragraphIndex: bookmark.paragraphIndex ?? null,
    textSnippet: bookmark.textSnippet || null,
    note: bookmark.note || null,
    createdAt: bookmark.createdAt,
    story: story
      ? {
          id: story.id,
          title: story.title,
          coverImage: story.coverImage || null,
          type: story.type || null,
          status: story.status || null,
          views: story.views ?? 0,
          followers: story.followers ?? 0,
          averageRating: story.averageRating ?? 0,
        }
      : null,
    chapter: chapter
      ? {
          id: chapter.id,
          chapterNumber: chapter.chapterNumber ?? null,
          title: chapter.title || null,
          createdAt: chapter.createdAt || null,
        }
      : null,
  };
}

// Chuyen danh sach role refs cua user thanh ten vai tro de tra ve API.
async function resolveRoleNamesForUser(user) {
  const ids = extractDbRefIds(user?.roles);
  if (ids.length === 0) {
    return [];
  }

  const roles = await Role.find({ _id: { $in: ids } }).lean();
  const roleMap = new Map(roles.map((role) => [String(role._id), role.name]));

  return ids.map((id) => roleMap.get(id)).filter(Boolean);
}

module.exports = {
  hydrateStory,
  hydrateStories,
  resolveRoleNamesForUser,
  serializeBookmarkResponse,
  serializeChapterListItem,
  serializeJwtResponse,
};

const Chapter = require("../models/chapter");
const Comment = require("../models/comment");
const Notification = require("../models/notification");
const Story = require("../models/story");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");
const { hasText, isObjectId, normalizeId } = require("../utils/normalize");
const {
  buildPublicProfileMap,
  hydrateCommentsWithProfiles,
} = require("../services/publicProfileService");
const {
  emitCommentCreated,
  emitCommentDeleted,
  emitNotificationsCreated,
} = require("../services/realtime");

const COMMENT_NOTIFICATION_TYPES = {
  REPLY: "COMMENT_REPLY",
  MENTION: "COMMENT_MENTION",
};

const MAX_MENTION_USERS = 8;

async function enrichComments(comments) {
  const userIds = Array.from(
    new Set(
      (Array.isArray(comments) ? comments : [])
        .flatMap((comment) => [comment?.userId, comment?.replyToUserId])
        .map((userId) => String(userId || "").trim())
        .filter(Boolean),
    ),
  );

  if (userIds.length === 0) {
    return (Array.isArray(comments) ? comments : []).map(serializeDoc);
  }

  const users = await User.find({ _id: { $in: userIds } }).lean();
  const profileMap = buildPublicProfileMap(users);
  return hydrateCommentsWithProfiles(comments, profileMap);
}

function normalizeOptionalPageIndex(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw httpError(400, "Loi: So trang binh luan khong hop le.");
  }

  return parsed;
}

function buildCommentScopeQuery({ storyId, chapterId, pageIndex }) {
  if (chapterId && pageIndex !== null) {
    return {
      chapterId,
      pageIndex,
    };
  }

  if (chapterId) {
    return {
      chapterId,
      pageIndex: null,
    };
  }

  return {
    storyId,
    chapterId: null,
    pageIndex: null,
  };
}

function isSameCommentScope(comment, target) {
  return (
    String(comment?.storyId || "") === String(target?.storyId || "") &&
    String(comment?.chapterId || "") === String(target?.chapterId || "") &&
    normalizeOptionalPageIndex(comment?.pageIndex) ===
      normalizeOptionalPageIndex(target?.pageIndex)
  );
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMentionedUsernames(content) {
  if (!hasText(content)) {
    return [];
  }

  const usernames = new Set();
  const matcher = /(^|[\s(])@([^\s@]{1,20})/g;
  let match = matcher.exec(String(content));

  while (match) {
    usernames.add(String(match[2] || "").trim().toLowerCase());
    if (usernames.size >= MAX_MENTION_USERS) {
      break;
    }
    match = matcher.exec(String(content));
  }

  return Array.from(usernames);
}

function buildNotificationContextLabel({ chapterNumber, chapterTitle, pageIndex }) {
  if (Number.isInteger(pageIndex) && pageIndex >= 0) {
    return `trang ${pageIndex + 1}`;
  }

  if (Number.isFinite(Number(chapterNumber))) {
    const chapterTitleText = String(chapterTitle || "").trim();
    return chapterTitleText
      ? `chuong ${chapterNumber}: ${chapterTitleText}`
      : `chuong ${chapterNumber}`;
  }

  return "truyen nay";
}

async function createCommentNotifications({
  actor,
  story,
  chapter,
  comment,
  parentComment,
}) {
  if (!actor?.id || !story || !comment) {
    return [];
  }

  const actorUsername = String(actor.username || "Nguoi dung").trim();
  const normalizedPageIndex = normalizeOptionalPageIndex(comment.pageIndex);
  const targetScope =
    normalizedPageIndex !== null
      ? "PAGE"
      : comment.chapterId
        ? "CHAPTER"
        : "STORY";
  const contextLabel = buildNotificationContextLabel({
    chapterNumber: chapter?.chapterNumber ?? comment.chapterNumber,
    chapterTitle: chapter?.title,
    pageIndex: normalizedPageIndex,
  });
  const notifications = [];
  const notifiedUserIds = new Set();

  const pushNotification = ({ type, userId, message }) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId || normalizedUserId === String(actor.id)) {
      return;
    }

    if (notifiedUserIds.has(normalizedUserId)) {
      return;
    }

    notifiedUserIds.add(normalizedUserId);
    notifications.push({
      type,
      userId: normalizedUserId,
      actorUserId: String(actor.id),
      actorUsername,
      message,
      storyId: String(story._id || story.id),
      storyTitle: story.title || "",
      storyCoverImage: story.coverImage || null,
      chapterId: chapter ? String(chapter._id || chapter.id) : comment.chapterId || null,
      chapterTitle: chapter?.title || "",
      chapterNumber: Number.isFinite(
        Number(chapter?.chapterNumber ?? comment.chapterNumber),
      )
        ? Number(chapter?.chapterNumber ?? comment.chapterNumber)
        : null,
      commentId: String(comment._id || comment.id),
      parentCommentId: comment.parentCommentId || null,
      pageIndex: normalizedPageIndex,
      targetScope,
      createdAt: new Date(),
    });
  };

  if (parentComment?.userId) {
    pushNotification({
      type: COMMENT_NOTIFICATION_TYPES.REPLY,
      userId: parentComment.userId,
      message: `${actorUsername} da tra loi binh luan cua ban trong ${contextLabel}.`,
    });
  }

  const mentionedUsernames = parseMentionedUsernames(comment.content);
  if (mentionedUsernames.length > 0) {
    const mentionedUsers = await User.find({
      username: {
        $in: mentionedUsernames.map(
          (username) => new RegExp(`^${escapeRegex(username)}$`, "i"),
        ),
      },
    })
      .select({ _id: 1, username: 1 })
      .lean();

    mentionedUsers.forEach((mentionedUser) => {
      pushNotification({
        type: COMMENT_NOTIFICATION_TYPES.MENTION,
        userId: mentionedUser._id,
        message: `${actorUsername} da nhac den ban trong binh luan o ${contextLabel}.`,
      });
    });
  }

  return notifications.length > 0
    ? Notification.insertMany(notifications)
    : [];
}

async function getCommentDescendants(rootComment) {
  if (!rootComment?.id && !rootComment?._id) {
    return [];
  }

  const scopeComments = await Comment.find(
    buildCommentScopeQuery({
      storyId: rootComment.storyId,
      chapterId: rootComment.chapterId || null,
      pageIndex: normalizeOptionalPageIndex(rootComment.pageIndex),
    }),
  ).lean();

  const rootId = String(rootComment.id || rootComment._id);
  const childrenByParentId = new Map();

  scopeComments.forEach((comment) => {
    const parentId = String(comment.parentCommentId || "").trim();
    if (!parentId) {
      return;
    }

    if (!childrenByParentId.has(parentId)) {
      childrenByParentId.set(parentId, []);
    }
    childrenByParentId.get(parentId).push(comment);
  });

  const descendants = [];
  const queue = [...(childrenByParentId.get(rootId) || [])];

  while (queue.length > 0) {
    const current = queue.shift();
    descendants.push(current);
    queue.push(...(childrenByParentId.get(String(current._id || current.id)) || []));
  }

  return descendants;
}

const listStoryComments = asyncHandler(async (req, res) => {
  const comments = await Comment.find({
    storyId: req.params.storyId,
    chapterId: null,
    pageIndex: null,
  })
    .sort({ createdAt: -1 })
    .lean();
  res.json(await enrichComments(comments));
});

const listChapterThreadComments = asyncHandler(async (req, res) => {
  const comments = await Comment.find({
    chapterId: req.params.chapterId,
  })
    .sort({ createdAt: -1 })
    .lean();
  res.json(await enrichComments(comments));
});

const listChapterComments = asyncHandler(async (req, res) => {
  const comments = await Comment.find({
    chapterId: req.params.chapterId,
    pageIndex: null,
  })
    .sort({ createdAt: -1 })
    .lean();
  res.json(await enrichComments(comments));
});

const listChapterPageComments = asyncHandler(async (req, res) => {
  const comments = await Comment.find({
    chapterId: req.params.chapterId,
    pageIndex: Number(req.params.pageIndex),
  })
    .sort({ createdAt: -1 })
    .lean();
  res.json(await enrichComments(comments));
});

const createComment = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const storyId = normalizeId(req.body.storyId);
  const chapterId = normalizeId(req.body.chapterId);
  const parentCommentId = normalizeId(req.body.parentCommentId);
  const pageIndex = normalizeOptionalPageIndex(req.body.pageIndex);

  if (!storyId) {
    throw httpError(400, "Loi: Thieu truyen de binh luan.");
  }

  if (!isObjectId(storyId)) {
    throw httpError(400, "Loi: Ma truyen khong hop le.");
  }

  if (chapterId && !isObjectId(chapterId)) {
    throw httpError(400, "Loi: Ma chuong khong hop le.");
  }

  if (parentCommentId && !isObjectId(parentCommentId)) {
    throw httpError(400, "Loi: Ma binh luan goc khong hop le.");
  }

  if (pageIndex !== null && !chapterId) {
    throw httpError(400, "Loi: Binh luan theo trang phai thuoc mot chuong.");
  }

  if (!hasText(req.body.content) && !hasText(req.body.gifUrl)) {
    throw httpError(400, "Loi: Can co noi dung binh luan hoac GIF.");
  }

  if (req.body.gifSize && Number(req.body.gifSize) > 2 * 1024 * 1024) {
    throw httpError(400, "Loi: Kich thuoc GIF phai nho hon hoac bang 2MB.");
  }

  const story = await Story.findById(storyId)
    .select({ _id: 1, title: 1, coverImage: 1 })
    .lean();
  if (!story) {
    throw httpError(404, "Loi: Khong tim thay truyen.");
  }

  let chapter = null;
  let chapterNumber = req.body.chapterNumber ?? null;
  if (chapterId) {
    chapter = await Chapter.findById(chapterId)
      .select({ _id: 1, storyId: 1, chapterNumber: 1, title: 1 })
      .lean();
    if (!chapter) {
      throw httpError(404, "Loi: Khong tim thay chuong.");
    }

    if (String(chapter.storyId || "") !== String(storyId)) {
      throw httpError(400, "Loi: Chuong khong thuoc truyen nay.");
    }

    chapterNumber = chapter.chapterNumber;
  }

  let parentComment = null;
  if (parentCommentId) {
    parentComment = await Comment.findById(parentCommentId).lean();
    if (!parentComment) {
      throw httpError(404, "Loi: Khong tim thay binh luan goc.");
    }

    if (
      !isSameCommentScope(parentComment, {
        storyId,
        chapterId,
        pageIndex,
      })
    ) {
      throw httpError(400, "Loi: Khong the tra loi binh luan o pham vi khac.");
    }
  }

  const comment = await Comment.create({
    storyId,
    chapterId,
    chapterNumber,
    pageIndex,
    parentCommentId,
    replyToUserId: parentComment?.userId ? String(parentComment.userId) : null,
    replyToUsername: parentComment?.username ? String(parentComment.username) : null,
    userId: String(user.id),
    username: user.username,
    content: hasText(req.body.content) ? String(req.body.content).trim() : null,
    gifUrl: hasText(req.body.gifUrl) ? String(req.body.gifUrl).trim() : null,
    gifSize:
      req.body.gifSize === undefined || req.body.gifSize === null
        ? null
        : Number(req.body.gifSize),
  });

  const notifications = await createCommentNotifications({
    actor: user,
    story,
    chapter,
    comment,
    parentComment,
  });
  const [enrichedComment] = await enrichComments([comment]);
  emitNotificationsCreated(notifications);
  emitCommentCreated(enrichedComment || serializeDoc(comment));
  res.json(enrichedComment || serializeDoc(comment));
});

const deleteComment = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const comment = await Comment.findById(req.params.id);
  if (!comment) {
    throw httpError(400, "Loi: Khong tim thay binh luan.");
  }

  const userIsAdmin = req.user.roles?.includes("ROLE_ADMIN");
  if (!userIsAdmin && String(comment.userId) !== String(user.id)) {
    throw httpError(400, "Loi: Khong co quyen thuc hien.");
  }

  const descendants = await getCommentDescendants(comment);
  const commentsToDelete = [serializeDoc(comment), ...descendants.map(serializeDoc)];
  const commentIds = commentsToDelete.map((item) => item.id).filter(Boolean);

  await Comment.deleteMany({ _id: { $in: commentIds } });
  commentsToDelete.forEach((deletedComment) => {
    emitCommentDeleted(deletedComment);
  });

  res.json(buildMessage("Da xoa binh luan thanh cong."));
});

module.exports = {
  listStoryComments,
  listChapterThreadComments,
  listChapterComments,
  listChapterPageComments,
  createComment,
  deleteComment,
};

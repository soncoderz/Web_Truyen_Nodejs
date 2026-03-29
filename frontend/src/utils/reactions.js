export const EMOTION_OPTIONS = [
  {
    value: "LIKE",
    label: "Thich",
    icon: "\uD83D\uDC4D",
    color: "#4f8cff",
  },
  {
    value: "LOVE",
    label: "Yeu thich",
    icon: "\u2764\uFE0F",
    color: "#ff4d6d",
  },
  {
    value: "HAHA",
    label: "Haha",
    icon: "\uD83D\uDE06",
    color: "#ffb347",
  },
  {
    value: "WOW",
    label: "Wow",
    icon: "\uD83D\uDE2E",
    color: "#ffd166",
  },
  {
    value: "SAD",
    label: "Buon",
    icon: "\uD83D\uDE22",
    color: "#8ecae6",
  },
  {
    value: "ANGRY",
    label: "Phan no",
    icon: "\uD83D\uDE21",
    color: "#ff7b54",
  },
];

export function makeReactionTargetKey(targetType, targetId) {
  const safeTargetType = String(targetType || "").trim().toUpperCase();
  const safeTargetId = String(targetId || "").trim();
  return `${safeTargetType}:${safeTargetId}`;
}

export function createEmptyReactionSummary(targetType, targetId) {
  return {
    targetType,
    targetId,
    totalCount: 0,
    userEmotion: null,
    counts: Object.fromEntries(EMOTION_OPTIONS.map((option) => [option.value, 0])),
    topReactions: [],
  };
}

export function getEmotionOption(emotion) {
  return EMOTION_OPTIONS.find((option) => option.value === emotion) || null;
}

export function buildStoryReactionTarget(storyId) {
  const id = String(storyId || "").trim();
  if (!id) {
    return null;
  }

  return {
    targetType: "STORY",
    targetId: id,
    storyId: id,
  };
}

export function buildChapterReactionTarget(storyId, chapterId) {
  const safeStoryId = String(storyId || "").trim();
  const safeChapterId = String(chapterId || "").trim();
  if (!safeChapterId) {
    return null;
  }

  return {
    targetType: "CHAPTER",
    targetId: safeChapterId,
    storyId: safeStoryId || null,
    chapterId: safeChapterId,
  };
}

export function buildMangaPageReactionTarget(storyId, chapterId, pageIndex) {
  const safeStoryId = String(storyId || "").trim();
  const safeChapterId = String(chapterId || "").trim();
  if (!safeChapterId || !Number.isInteger(pageIndex) || pageIndex < 0) {
    return null;
  }

  return {
    targetType: "MANGA_PAGE",
    targetId: `${safeChapterId}:page:${pageIndex}`,
    storyId: safeStoryId || null,
    chapterId: safeChapterId,
    pageIndex,
  };
}

export function buildNovelParagraphReactionTarget(storyId, chapterId, paragraphIndex) {
  const safeStoryId = String(storyId || "").trim();
  const safeChapterId = String(chapterId || "").trim();
  if (!safeChapterId || !Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
    return null;
  }

  return {
    targetType: "NOVEL_PARAGRAPH",
    targetId: `${safeChapterId}:paragraph:${paragraphIndex}`,
    storyId: safeStoryId || null,
    chapterId: safeChapterId,
    paragraphIndex,
  };
}

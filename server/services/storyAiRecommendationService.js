const { ensureArray } = require("../utils/normalize");

const TEXT_STOP_WORDS = new Set([
  "anh",
  "ban",
  "bo",
  "cac",
  "cau",
  "cho",
  "chuong",
  "cua",
  "dang",
  "day",
  "de",
  "den",
  "duoc",
  "giai",
  "gioi",
  "hai",
  "hay",
  "hien",
  "hon",
  "khi",
  "khong",
  "lam",
  "lai",
  "len",
  "light",
  "manga",
  "mot",
  "neu",
  "nguoi",
  "nhan",
  "nhieu",
  "noi",
  "novel",
  "phan",
  "sau",
  "the",
  "theo",
  "thi",
  "thu",
  "trong",
  "truyen",
  "voi",
]);
const DESCRIPTION_PREFIX_PATTERNS = [
  /^duoi day la noi dung van ban tu hinh anh ban da gui:\s*/iu,
  /^ocr\s*:?\s*/iu,
  /^transcription\s*:?\s*/iu,
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TEXT_STOP_WORDS.has(token));
}

function uniqueByNormalized(values) {
  const items = [];
  const seen = new Set();

  for (const value of ensureArray(values)) {
    const label = String(value || "").trim();
    const normalized = normalizeText(label);
    if (!label || !normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    items.push(label);
  }

  return items;
}

function buildNameMap(values) {
  const map = new Map();

  for (const value of ensureArray(values)) {
    const label = String(value || "").trim();
    const normalized = normalizeText(label);
    if (!label || !normalized || map.has(normalized)) {
      continue;
    }

    map.set(normalized, label);
  }

  return map;
}

function createTokenWeights() {
  return new Map();
}

function addWeightedTokens(targetMap, value, weight) {
  for (const token of tokenizeText(value)) {
    targetMap.set(token, (targetMap.get(token) || 0) + weight);
  }
}

function getCategoryList(story) {
  return ensureArray(story?.categories)
    .map((category) => ({
      name: String(category?.name || "").trim(),
      description: String(category?.description || "").trim(),
    }))
    .filter((category) => category.name);
}

function getAuthorList(story) {
  return ensureArray(story?.authors)
    .map((author) => ({
      name: String(author?.name || "").trim(),
      description: String(author?.description || "").trim(),
    }))
    .filter((author) => author.name);
}

function cleanDescriptionText(value) {
  let cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  let updated = true;
  while (updated && cleaned) {
    updated = false;
    for (const pattern of DESCRIPTION_PREFIX_PATTERNS) {
      const nextValue = cleaned.replace(pattern, "").trim();
      if (nextValue !== cleaned) {
        cleaned = nextValue;
        updated = true;
      }
    }
  }

  return cleaned.replace(/^[\s"'“”]+/, "").replace(/[\s"'“”]+$/, "").trim();
}

function buildStoryProfile(story) {
  const categories = getCategoryList(story);
  const authors = getAuthorList(story);
  const tokenWeights = createTokenWeights();
  const reasonTokenWeights = createTokenWeights();
  const cleanedDescription = cleanDescriptionText(story?.description);

  addWeightedTokens(tokenWeights, story?.title, 5);
  addWeightedTokens(reasonTokenWeights, story?.title, 4);
  addWeightedTokens(tokenWeights, cleanedDescription, 5);
  addWeightedTokens(reasonTokenWeights, cleanedDescription, 5);

  categories.forEach((category) => {
    addWeightedTokens(tokenWeights, category.name, 5);
    addWeightedTokens(reasonTokenWeights, category.name, 4);
    addWeightedTokens(tokenWeights, category.description, 2);
  });

  authors.forEach((author) => {
    addWeightedTokens(tokenWeights, author.name, 6);
    addWeightedTokens(reasonTokenWeights, author.name, 5);
    addWeightedTokens(tokenWeights, author.description, 2);
  });

  return {
    id: String(story?.id || story?._id || ""),
    type: String(story?.type || "").toUpperCase(),
    status: String(story?.status || "").toUpperCase(),
    title: String(story?.title || "").trim(),
    description: cleanedDescription,
    chapterCount: Math.max(0, Number(story?.chapterCount || 0)),
    latestChapterNumber: Number.isFinite(Number(story?.latestChapterNumber))
      ? Number(story.latestChapterNumber)
      : null,
    followers: Math.max(0, Number(story?.followers || 0)),
    views: Math.max(0, Number(story?.views || 0)),
    averageRating: Math.max(0, Number(story?.averageRating || 0)),
    totalRatings: Math.max(0, Number(story?.totalRatings || 0)),
    categoryNames: uniqueByNormalized(categories.map((category) => category.name)),
    authorNames: uniqueByNormalized(authors.map((author) => author.name)),
    relatedStoryIds: new Set(ensureArray(story?.relatedStoryIds).map((value) => String(value || "").trim()).filter(Boolean)),
    tokenWeights,
    reasonTokenWeights,
  };
}

function getSharedLabels(baseValues, candidateValues) {
  const baseMap = buildNameMap(baseValues);
  const candidateMap = buildNameMap(candidateValues);
  const shared = [];

  for (const [normalized, label] of baseMap.entries()) {
    if (candidateMap.has(normalized)) {
      shared.push(label);
    }
  }

  return shared;
}

function getSharedKeywords(baseProfile, candidateProfile, limit = 4) {
  const shared = [];

  for (const [token, baseWeight] of baseProfile.reasonTokenWeights.entries()) {
    const candidateWeight = candidateProfile.reasonTokenWeights.get(token);
    if (!candidateWeight) {
      continue;
    }

    shared.push({
      token,
      weight: baseWeight + candidateWeight,
    });
  }

  return shared
    .sort((left, right) => right.weight - left.weight || left.token.localeCompare(right.token))
    .slice(0, limit)
    .map((item) => item.token);
}

function formatCompactList(values, maxItems = 3) {
  const items = ensureArray(values).filter(Boolean);
  if (items.length <= maxItems) {
    return items.join(", ");
  }

  return `${items.slice(0, maxItems).join(", ")} +${items.length - maxItems}`;
}

function formatStatusLabel(status) {
  if (status === "COMPLETED") {
    return "Hoan thanh";
  }
  if (status === "ONGOING") {
    return "Dang ra";
  }
  if (status === "DROPPED") {
    return "Tam dung";
  }

  return "Khac";
}

function formatTypeLabel(type) {
  return type === "MANGA" ? "truyen tranh" : "light novel";
}

function ratioSimilarity(leftValue, rightValue) {
  const left = Math.max(0, Number(leftValue || 0));
  const right = Math.max(0, Number(rightValue || 0));
  if (!left || !right) {
    return 0;
  }

  return Math.min(left, right) / Math.max(left, right);
}

function calculatePopularityScore(story) {
  const averageRating = clamp(Number(story?.averageRating || 0) / 5, 0, 1);
  const totalRatings = clamp(Math.log1p(Number(story?.totalRatings || 0)) / Math.log(300), 0, 1);
  const followers = clamp(Math.log1p(Number(story?.followers || 0)) / Math.log(3000), 0, 1);
  const views = clamp(Math.log1p(Number(story?.views || 0)) / Math.log(200000), 0, 1);

  return averageRating * 12 + totalRatings * 8 + followers * 8 + views * 5;
}

function buildPopularityReason(story) {
  const averageRating = Number(story?.averageRating || 0);
  const followers = Number(story?.followers || 0);
  const totalRatings = Number(story?.totalRatings || 0);

  if (averageRating >= 4.2 && totalRatings > 0) {
    return `duoc danh gia tot voi ${averageRating.toFixed(1)}/5 sao`;
  }

  if (followers >= 100) {
    return `co ${followers.toLocaleString("vi-VN")} theo doi`;
  }

  if (totalRatings >= 20) {
    return `nhan ${totalRatings.toLocaleString("vi-VN")} danh gia`;
  }

  return null;
}

function calculateChapterSimilarityScore(baseProfile, candidateProfile) {
  if (!baseProfile.chapterCount || !candidateProfile.chapterCount) {
    return 0;
  }

  const similarity = ratioSimilarity(baseProfile.chapterCount, candidateProfile.chapterCount);
  if (similarity >= 0.8) {
    return 10;
  }
  if (similarity >= 0.6) {
    return 5;
  }

  return 0;
}

function buildChapterSimilarityReason(baseProfile, candidateProfile) {
  if (!baseProfile.chapterCount || !candidateProfile.chapterCount) {
    return null;
  }

  const similarity = ratioSimilarity(baseProfile.chapterCount, candidateProfile.chapterCount);
  if (similarity < 0.6) {
    return null;
  }

  return `so chuong gan nhau (${candidateProfile.chapterCount} chuong)`;
}

function calculateAudienceSimilarityScore(baseProfile, candidateProfile) {
  let score = 0;

  if (baseProfile.averageRating > 0 && candidateProfile.averageRating > 0) {
    const ratingGap = Math.abs(baseProfile.averageRating - candidateProfile.averageRating);
    if (ratingGap <= 0.35) {
      score += 6;
    } else if (ratingGap <= 0.75) {
      score += 3;
    }
  }

  if (ratioSimilarity(baseProfile.followers, candidateProfile.followers) >= 0.45) {
    score += 4;
  }

  if (ratioSimilarity(baseProfile.views, candidateProfile.views) >= 0.35) {
    score += 2;
  }

  return score;
}

function buildAudienceReason(baseProfile, candidateProfile) {
  if (
    baseProfile.averageRating > 0 &&
    candidateProfile.averageRating > 0 &&
    Math.abs(baseProfile.averageRating - candidateProfile.averageRating) <= 0.5
  ) {
    return `muc danh gia gan nhau (${candidateProfile.averageRating.toFixed(1)}/5 sao)`;
  }

  if (ratioSimilarity(baseProfile.followers, candidateProfile.followers) >= 0.45) {
    return "muc do theo doi cua doc gia kha gan nhau";
  }

  return null;
}

function buildExplanation(title, reasons) {
  const fragments = ensureArray(reasons).filter(Boolean).slice(0, 2);
  if (fragments.length === 0) {
    return `Goi y ${title} vi co nhieu diem gan voi truyen ban dang xem.`;
  }

  if (fragments.length === 1) {
    return `${title} duoc goi y vi ${fragments[0].charAt(0).toLowerCase()}${fragments[0].slice(1)}.`;
  }

  return `${title} duoc goi y vi ${fragments[0].charAt(0).toLowerCase()}${fragments[0].slice(1)} va ${fragments[1].charAt(0).toLowerCase()}${fragments[1].slice(1)}.`;
}

function buildRecommendationItem(baseStory, candidateStory) {
  const baseProfile = buildStoryProfile(baseStory);
  const candidateProfile = buildStoryProfile(candidateStory);

  if (!candidateProfile.id || candidateProfile.id === baseProfile.id) {
    return null;
  }

  const sharedCategories = getSharedLabels(baseProfile.categoryNames, candidateProfile.categoryNames);
  const sharedAuthors = getSharedLabels(baseProfile.authorNames, candidateProfile.authorNames);
  const sharedKeywords = getSharedKeywords(baseProfile, candidateProfile, 4);
  const sameType = baseProfile.type && candidateProfile.type === baseProfile.type;
  const sameStatus = baseProfile.status && candidateProfile.status === baseProfile.status;
  const manuallyRelated =
    baseProfile.relatedStoryIds.has(candidateProfile.id) ||
    candidateProfile.relatedStoryIds.has(baseProfile.id);
  const chapterSimilarityScore = calculateChapterSimilarityScore(baseProfile, candidateProfile);
  const audienceSimilarityScore = calculateAudienceSimilarityScore(baseProfile, candidateProfile);

  let score = 0;
  if (sameType) {
    score += 16;
  }
  if (sameStatus) {
    score += 5;
  }
  if (sharedCategories.length > 0) {
    score += Math.min(48, 22 + (sharedCategories.length - 1) * 12);
  }
  if (sharedAuthors.length > 0) {
    score += Math.min(42, 30 + (sharedAuthors.length - 1) * 12);
  }
  if (sharedKeywords.length > 0) {
    score += Math.min(24, 8 + sharedKeywords.length * 4);
  }
  if (manuallyRelated) {
    score += 18;
  }
  score += chapterSimilarityScore;
  score += audienceSimilarityScore;
  score += calculatePopularityScore(candidateStory);

  const reasons = [];
  if (sharedAuthors.length > 0) {
    reasons.push(`cung tac gia ${formatCompactList(sharedAuthors)}`);
  }
  if (sharedCategories.length > 0) {
    reasons.push(`trung ${sharedCategories.length} the loai: ${formatCompactList(sharedCategories)}`);
  }
  if (sharedKeywords.length >= 3) {
    reasons.push("mo ta co nhieu diem tuong dong");
  }
  if (sameType) {
    reasons.push(`cung dang ${formatTypeLabel(candidateProfile.type)}`);
  }
  if (sameStatus) {
    reasons.push(`cung trang thai ${formatStatusLabel(candidateProfile.status)}`);
  }
  const chapterSimilarityReason = buildChapterSimilarityReason(baseProfile, candidateProfile);
  if (chapterSimilarityReason) {
    reasons.push(chapterSimilarityReason);
  }
  const audienceReason = buildAudienceReason(baseProfile, candidateProfile);
  if (audienceReason) {
    reasons.push(audienceReason);
  }

  const popularityReason = buildPopularityReason(candidateStory);
  if (popularityReason) {
    reasons.push(popularityReason);
  }
  if (manuallyRelated) {
    reasons.push("nam trong danh sach lien quan da duoc khai bao");
  }

  const uniqueReasons = Array.from(new Set(reasons.map((reason) => String(reason).trim()).filter(Boolean)));
  const matchScore = clamp(Math.round((score / 160) * 100), 1, 99);

  return {
    story: candidateStory,
    matchScore,
    rawScore: Math.round(score),
    reasons: uniqueReasons.slice(0, 4),
    explanation: buildExplanation(candidateStory.title || "Truyen nay", uniqueReasons.slice(0, 2)),
    signals: {
      sharedCategories,
      sharedAuthors,
      sharedKeywords,
      sameType,
      sameStatus,
      manuallyRelated,
    },
  };
}

function buildFallbackRecommendations(baseStory, stories, limit) {
  const baseProfile = buildStoryProfile(baseStory);

  return ensureArray(stories)
    .filter((story) => String(story?.id || story?._id || "") !== baseProfile.id)
    .sort((left, right) => {
      const leftType = String(left?.type || "").toUpperCase() === baseProfile.type ? 1 : 0;
      const rightType = String(right?.type || "").toUpperCase() === baseProfile.type ? 1 : 0;
      if (rightType !== leftType) {
        return rightType - leftType;
      }

      return (
        Number(right?.followers || 0) - Number(left?.followers || 0) ||
        Number(right?.averageRating || 0) - Number(left?.averageRating || 0) ||
        Number(right?.views || 0) - Number(left?.views || 0)
      );
    })
    .slice(0, limit)
    .map((story, index) => ({
      story,
      matchScore: clamp(68 - index * 4, 48, 68),
      rawScore: clamp(68 - index * 4, 48, 68),
      reasons: [
        `cung dang ${formatTypeLabel(String(story?.type || "").toUpperCase())}`,
        "duoc uu tien theo muc do quan tam cua doc gia",
      ],
      explanation: `${story.title || "Truyen nay"} duoc dua vao danh sach vi cung loai va dang co nhieu doc gia quan tam.`,
      signals: {
        sharedCategories: [],
        sharedAuthors: [],
        sharedKeywords: [],
        sameType: String(story?.type || "").toUpperCase() === baseProfile.type,
        sameStatus: false,
        manuallyRelated: false,
      },
    }));
}

function buildAiStoryRecommendations(baseStory, candidateStories, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 6), 12));
  const recommendations = ensureArray(candidateStories)
    .map((story) => buildRecommendationItem(baseStory, story))
    .filter((item) => item && item.rawScore >= 18)
    .sort((left, right) => right.rawScore - left.rawScore || right.matchScore - left.matchScore);

  if (recommendations.length > 0) {
    return recommendations.slice(0, limit);
  }

  return buildFallbackRecommendations(baseStory, candidateStories, limit);
}

module.exports = {
  buildAiStoryRecommendations,
};

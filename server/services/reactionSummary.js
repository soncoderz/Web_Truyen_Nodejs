const { Reaction, VALID_EMOTIONS } = require("../models/reaction");
const { ensureArray } = require("../utils/normalize");

// Key gom targetType + targetId de group reaction tren nhieu doi tuong cung luc.
function toTargetKey(targetType, targetId) {
  return `${targetType}:${targetId}`;
}

// Khoi tao summary mac dinh cho target chua co reaction nao.
function createEmptySummary(targetType, targetId) {
  return {
    targetType,
    targetId,
    totalCount: 0,
    userEmotion: null,
    counts: Object.fromEntries(VALID_EMOTIONS.map((emotion) => [emotion, 0])),
    topReactions: [],
  };
}

// Top reactions la 3 emotion co so luong cao nhat, dung de hien thi nhanh.
function decorateSummary(summary) {
  const topReactions = Object.entries(summary.counts)
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return VALID_EMOTIONS.indexOf(left[0]) - VALID_EMOTIONS.indexOf(right[0]);
    })
    .slice(0, 3)
    .map(([emotion, count]) => ({ emotion, count }));

  return {
    ...summary,
    topReactions,
  };
}

// Gop reaction raw thanh summary tong hop, dong thoi ghi nhan emotion cua current user neu co.
function buildSummaries(targets, reactions, currentUserId = null) {
  const summaryMap = new Map();

  ensureArray(targets).forEach(({ targetType, targetId }) => {
    summaryMap.set(
      toTargetKey(targetType, targetId),
      createEmptySummary(targetType, targetId),
    );
  });

  ensureArray(reactions).forEach((reaction) => {
    const key = toTargetKey(reaction.targetType, reaction.targetId);
    const summary =
      summaryMap.get(key) ||
      createEmptySummary(reaction.targetType, reaction.targetId);

    summary.counts[reaction.emotion] = Number(summary.counts[reaction.emotion] || 0) + 1;
    summary.totalCount += 1;
    if (currentUserId && String(reaction.userId) === String(currentUserId)) {
      summary.userEmotion = reaction.emotion;
    }

    summaryMap.set(key, summary);
  });

  return Array.from(summaryMap.values()).map(decorateSummary);
}

// Tai summary cho mot target duy nhat.
async function loadTargetSummary(targetType, targetId, currentUserId = null) {
  const reactions = await Reaction.find({ targetType, targetId }).lean();
  const [summary] = buildSummaries([{ targetType, targetId }], reactions, currentUserId);
  return summary || createEmptySummary(targetType, targetId);
}

// Tra ve ca summary cong khai va summary theo goc nhin cua viewer hien tai.
async function loadTargetSummaryPair(targetType, targetId, currentUserId = null) {
  const reactions = await Reaction.find({ targetType, targetId }).lean();
  const [publicSummary] = buildSummaries([{ targetType, targetId }], reactions, null);
  const [viewerSummary] = currentUserId
    ? buildSummaries([{ targetType, targetId }], reactions, currentUserId)
    : [publicSummary];

  return {
    publicSummary: publicSummary || createEmptySummary(targetType, targetId),
    viewerSummary:
      viewerSummary || createEmptySummary(targetType, targetId),
  };
}

module.exports = {
  buildSummaries,
  createEmptySummary,
  loadTargetSummary,
  loadTargetSummaryPair,
};

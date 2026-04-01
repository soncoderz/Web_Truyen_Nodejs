const { Reaction, VALID_EMOTIONS, VALID_TARGET_TYPES } = require("../models/reaction");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const {
  ensureArray,
  hasText,
  normalizeId,
  normalizeLong,
} = require("../utils/normalize");
const httpError = require("../utils/httpError");
const {
  buildSummaries,
  loadTargetSummary,
  loadTargetSummaryPair,
} = require("../services/reactionSummary");
const { emitReactionUpdated } = require("../services/realtime");

function normalizeTargetType(value) {
  const targetType = String(value || "").trim().toUpperCase();
  if (!VALID_TARGET_TYPES.includes(targetType)) {
    throw httpError(400, "Invalid reaction target type.");
  }
  return targetType;
}

function normalizeEmotion(value) {
  if (!hasText(value)) {
    return null;
  }

  const emotion = String(value).trim().toUpperCase();
  if (!VALID_EMOTIONS.includes(emotion)) {
    throw httpError(400, "Invalid reaction emotion.");
  }

  return emotion;
}

function normalizeTargetId(value) {
  const targetId = normalizeId(value);
  if (!targetId) {
    throw httpError(400, "Reaction target id is required.");
  }

  return targetId;
}

function normalizeTargetPayload(input) {
  const targetType = normalizeTargetType(input?.targetType);
  const targetId = normalizeTargetId(input?.targetId);

  return {
    targetType,
    targetId,
  };
}

const getSummary = asyncHandler(async (req, res) => {
  const targetType = normalizeTargetType(req.query.targetType);
  const targetId = normalizeTargetId(req.query.targetId);
  const summary = await loadTargetSummary(
    targetType,
    targetId,
    req.user?.id || null,
  );
  res.json(summary);
});

const getBatchSummary = asyncHandler(async (req, res) => {
  const targets = ensureArray(req.body?.targets)
    .slice(0, 1000)
    .map(normalizeTargetPayload);

  if (targets.length === 0) {
    return res.json([]);
  }

  const reactions = await Reaction.find({
    $or: targets.map(({ targetType, targetId }) => ({
      targetType,
      targetId,
    })),
  }).lean();

  return res.json(buildSummaries(targets, reactions, req.user?.id || null));
});

const setReaction = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  const targetType = normalizeTargetType(req.body?.targetType);
  const targetId = normalizeTargetId(req.body?.targetId);
  const emotion = normalizeEmotion(req.body?.emotion);
  const filter = {
    userId: user.id,
    targetType,
    targetId,
  };

  const existingReaction = await Reaction.findOne(filter);

  if (!emotion) {
    if (existingReaction) {
      await existingReaction.deleteOne();
    }

    const { publicSummary, viewerSummary } = await loadTargetSummaryPair(
      targetType,
      targetId,
      user.id,
    );

    emitReactionUpdated({
      targetType,
      targetId,
      summary: publicSummary,
      actorUserId: user.id,
      actorEmotion: null,
    });

    return res.json({
      summary: viewerSummary,
    });
  }

  const payload = {
    userId: user.id,
    targetType,
    targetId,
    emotion,
    storyId: normalizeId(req.body?.storyId),
    chapterId: normalizeId(req.body?.chapterId),
    pageIndex:
      req.body?.pageIndex === undefined || req.body?.pageIndex === null
        ? null
        : normalizeLong(req.body.pageIndex, null),
    paragraphIndex:
      req.body?.paragraphIndex === undefined || req.body?.paragraphIndex === null
        ? null
        : normalizeLong(req.body.paragraphIndex, null),
    updatedAt: new Date(),
  };

  if (existingReaction) {
    existingReaction.emotion = payload.emotion;
    existingReaction.storyId = payload.storyId;
    existingReaction.chapterId = payload.chapterId;
    existingReaction.pageIndex = payload.pageIndex;
    existingReaction.paragraphIndex = payload.paragraphIndex;
    existingReaction.updatedAt = payload.updatedAt;
    await existingReaction.save();
  } else {
    await Reaction.create({
      ...payload,
      createdAt: new Date(),
    });
  }

  const { publicSummary, viewerSummary } = await loadTargetSummaryPair(
    targetType,
    targetId,
    user.id,
  );

  emitReactionUpdated({
    targetType,
    targetId,
    summary: publicSummary,
    actorUserId: user.id,
    actorEmotion: emotion,
  });

  return res.json({
    summary: viewerSummary,
  });
});

module.exports = {
  getSummary,
  getBatchSummary,
  setReaction,
};

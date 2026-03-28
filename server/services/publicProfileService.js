const { serializeDoc } = require("../utils/serialize");
const {
  DEFAULT_PROFILE_SKIN_ID,
  buildBadgeList,
  ensureRewardState,
  getProfileSkinDefinition,
} = require("./rewardService");

function toSerializableUser(user) {
  const plainUser = serializeDoc(user);
  const safeUser = {
    ...plainUser,
    followedStoryIds: Array.isArray(plainUser.followedStoryIds)
      ? plainUser.followedStoryIds
      : [],
    purchasedStoryIds: Array.isArray(plainUser.purchasedStoryIds)
      ? plainUser.purchasedStoryIds
      : [],
    ownedProfileSkinIds: Array.isArray(plainUser.ownedProfileSkinIds)
      ? plainUser.ownedProfileSkinIds
      : [DEFAULT_PROFILE_SKIN_ID],
    equippedProfileSkinId:
      plainUser.equippedProfileSkinId || DEFAULT_PROFILE_SKIN_ID,
    badges: Array.isArray(plainUser.badges) ? plainUser.badges : [],
    readingStreak: Number(plainUser.readingStreak || 0),
    longestReadingStreak: Number(plainUser.longestReadingStreak || 0),
  };

  ensureRewardState(safeUser);
  return safeUser;
}

function buildPublicProfilePayload(user, extraStats = {}) {
  const safeUser = toSerializableUser(user);
  const activeSkin =
    getProfileSkinDefinition(safeUser.equippedProfileSkinId) ||
    getProfileSkinDefinition(DEFAULT_PROFILE_SKIN_ID);
  const badges = buildBadgeList(safeUser).filter((badge) => badge.unlocked);

  return {
    id: safeUser.id,
    username: safeUser.username,
    avatar: safeUser.avatar || null,
    createdAt: safeUser.createdAt || null,
    activeSkin,
    badges,
    stats: {
      readingStreak: safeUser.readingStreak,
      longestReadingStreak: safeUser.longestReadingStreak,
      followingCount: safeUser.followedStoryIds.length,
      purchasedCount: safeUser.purchasedStoryIds.length,
      ...extraStats,
    },
  };
}

function buildPublicProfileMap(users) {
  return new Map(
    (Array.isArray(users) ? users : []).map((user) => {
      const profile = buildPublicProfilePayload(user);
      return [profile.id, profile];
    }),
  );
}

function hydrateCommentWithProfile(comment, profileMap) {
  const plainComment = serializeDoc(comment);
  const profile =
    profileMap.get(String(plainComment.userId || "")) || null;

  return {
    ...plainComment,
    avatar: profile?.avatar || null,
    profileUserId: profile?.id || plainComment.userId || null,
    profileSkin: profile?.activeSkin || null,
    profileBadges: profile?.badges || [],
  };
}

function hydrateCommentsWithProfiles(comments, profileMap) {
  return (Array.isArray(comments) ? comments : []).map((comment) =>
    hydrateCommentWithProfile(comment, profileMap),
  );
}

module.exports = {
  buildPublicProfileMap,
  buildPublicProfilePayload,
  hydrateCommentsWithProfiles,
};

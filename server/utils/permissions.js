const {
  buildUserEntitlements,
  hasStoryFullAccess,
  resolveChapterAccess,
} = require("../services/monetizationService");

function isApprovedStatus(status) {
  return status === undefined || status === null || status === "APPROVED";
}

function isAdmin(user) {
  return Boolean(user?.roles?.includes("ROLE_ADMIN"));
}

function isOwner(entity, user) {
  return Boolean(
    user &&
      entity?.uploaderId &&
      String(entity.uploaderId) === String(user.id),
  );
}

function canViewStory(story, user) {
  return isApprovedStatus(story?.approvalStatus) || isAdmin(user) || isOwner(story, user);
}

function canManageStory(story, user) {
  return isAdmin(user) || isOwner(story, user);
}

function normalizeEntitlementsInput(input) {
  if (input && typeof input === "object" && input.purchasedStoryIds instanceof Set) {
    return input;
  }

  return buildUserEntitlements({
    purchasedStoryIds: Array.isArray(input) ? input : [],
  });
}

function canAccessLicensedStory(story, user, entitlementsInput = []) {
  if (!story?.licensed || Number(story?.unlockPrice || 0) <= 0) {
    return true;
  }

  return hasStoryFullAccess(story, user, normalizeEntitlementsInput(entitlementsInput));
}

function canViewChapter(chapter, story, user, entitlementsInput = []) {
  return (
    canViewStory(story, user) &&
    resolveChapterAccess(
      chapter,
      story,
      user,
      normalizeEntitlementsInput(entitlementsInput),
    ).canRead &&
    (isApprovedStatus(chapter?.approvalStatus) || canManageStory(story, user))
  );
}

module.exports = {
  canAccessLicensedStory,
  canManageStory,
  canViewChapter,
  canViewStory,
  isAdmin,
  isApprovedStatus,
  isOwner,
};

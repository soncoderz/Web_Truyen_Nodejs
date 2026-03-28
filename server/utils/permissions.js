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

function canAccessLicensedStory(story, user, purchasedStoryIds = []) {
  if (!story?.licensed || Number(story?.unlockPrice || 0) <= 0) {
    return true;
  }

  return (
    isAdmin(user) ||
    isOwner(story, user) ||
    purchasedStoryIds.includes(String(story.id || story._id))
  );
}

function canViewChapter(chapter, story, user, purchasedStoryIds = []) {
  return (
    canViewStory(story, user) &&
    canAccessLicensedStory(story, user, purchasedStoryIds) &&
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

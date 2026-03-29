const { ensureArray, normalizeId, normalizeLong, uniqueStrings } = require("../utils/normalize");

const CHAPTER_ACCESS_MODES = {
  FREE: "FREE",
  PURCHASE: "PURCHASE",
  EARLY_ACCESS: "EARLY_ACCESS",
};

const CHAPTER_ACCESS_MODE_VALUES = Object.values(CHAPTER_ACCESS_MODES);
const STORY_RENTAL_DURATION_DAYS = 7;

function isAdminUser(user) {
  return Boolean(user?.roles?.includes("ROLE_ADMIN"));
}

function isOwnerEntity(entity, user) {
  return Boolean(
    user &&
      entity?.uploaderId &&
      String(entity.uploaderId) === String(user.id),
  );
}

function normalizeCurrencyAmount(value, fallback = 0) {
  const amount = normalizeLong(value, fallback);
  return amount < 0 ? 0 : amount;
}

function normalizePercent(value, fallback = 15) {
  const amount = normalizeLong(value, fallback);
  if (amount < 0) {
    return 0;
  }
  if (amount > 90) {
    return 90;
  }
  return amount;
}

function normalizeBundleSize(value, fallback = 3) {
  const amount = normalizeLong(value, fallback);
  if (amount < 2) {
    return 2;
  }
  return amount;
}

function normalizeChapterAccessMode(value) {
  const mode = String(value || CHAPTER_ACCESS_MODES.FREE).trim().toUpperCase();
  return CHAPTER_ACCESS_MODE_VALUES.includes(mode)
    ? mode
    : CHAPTER_ACCESS_MODES.FREE;
}

function sanitizeRentalEntries(value, now = new Date()) {
  return ensureArray(value)
    .map((entry) => {
      const storyId = normalizeId(entry?.storyId);
      const expiresAt = entry?.expiresAt ? new Date(entry.expiresAt) : null;
      if (!storyId || Number.isNaN(expiresAt?.getTime())) {
        return null;
      }

      return {
        storyId,
        expiresAt,
        isActive: expiresAt.getTime() > now.getTime(),
      };
    })
    .filter(Boolean);
}

function buildUserEntitlements(user, now = new Date()) {
  const rentalEntries = sanitizeRentalEntries(user?.rentedStoryAccesses, now);
  const activeRentalMap = new Map(
    rentalEntries
      .filter((entry) => entry.isActive)
      .map((entry) => [entry.storyId, entry.expiresAt]),
  );

  return {
    purchasedStoryIds: new Set(uniqueStrings(user?.purchasedStoryIds)),
    purchasedChapterIds: new Set(uniqueStrings(user?.purchasedChapterIds)),
    activeRentals: rentalEntries.filter((entry) => entry.isActive),
    activeRentalMap,
  };
}

function getStoryId(story) {
  return String(story?.id || story?._id || "").trim();
}

function getChapterId(chapter) {
  return String(chapter?.id || chapter?._id || "").trim();
}

function hasStoryPurchase(story, entitlements) {
  const storyId = getStoryId(story);
  return Boolean(storyId && entitlements?.purchasedStoryIds?.has(storyId));
}

function getActiveStoryRentalExpiry(story, entitlements) {
  const storyId = getStoryId(story);
  return storyId ? entitlements?.activeRentalMap?.get(storyId) || null : null;
}

function hasChapterPurchase(chapter, entitlements) {
  const chapterId = getChapterId(chapter);
  return Boolean(chapterId && entitlements?.purchasedChapterIds?.has(chapterId));
}

function hasStoryFullAccess(story, user, entitlements) {
  return (
    isAdminUser(user) ||
    isOwnerEntity(story, user) ||
    hasStoryPurchase(story, entitlements) ||
    Boolean(getActiveStoryRentalExpiry(story, entitlements))
  );
}

function getChapterAccessOffer(chapter) {
  const accessMode = normalizeChapterAccessMode(chapter?.accessMode);
  const accessPrice =
    accessMode === CHAPTER_ACCESS_MODES.FREE
      ? 0
      : normalizeCurrencyAmount(chapter?.accessPrice, 0);

  return {
    accessMode,
    accessPrice,
    requiresDirectPurchase:
      accessMode !== CHAPTER_ACCESS_MODES.FREE && accessPrice > 0,
  };
}

function resolveChapterAccess(chapter, story, user, entitlements) {
  const storyLicensed = Boolean(story?.licensed) && normalizeCurrencyAmount(story?.unlockPrice, 0) > 0;
  const storyPurchased = hasStoryPurchase(story, entitlements);
  const rentalExpiresAt = getActiveStoryRentalExpiry(story, entitlements);
  const chapterPurchased = hasChapterPurchase(chapter, entitlements);
  const chapterOffer = getChapterAccessOffer(chapter);

  if (isAdminUser(user) || isOwnerEntity(story, user)) {
    return {
      canRead: true,
      isLocked: false,
      lockReason: null,
      storyPurchased,
      chapterPurchased,
      rentalExpiresAt,
      ...chapterOffer,
    };
  }

  if (storyPurchased || rentalExpiresAt) {
    return {
      canRead: true,
      isLocked: false,
      lockReason: null,
      storyPurchased,
      chapterPurchased,
      rentalExpiresAt,
      ...chapterOffer,
    };
  }

  if (chapterPurchased) {
    return {
      canRead: true,
      isLocked: false,
      lockReason: null,
      storyPurchased,
      chapterPurchased,
      rentalExpiresAt,
      ...chapterOffer,
    };
  }

  if (storyLicensed) {
    if (chapterOffer.requiresDirectPurchase) {
      return {
        canRead: false,
        isLocked: true,
        lockReason:
          chapterOffer.accessMode === CHAPTER_ACCESS_MODES.EARLY_ACCESS
            ? "EARLY_ACCESS_REQUIRED"
            : "CHAPTER_PURCHASE_REQUIRED",
        storyPurchased,
        chapterPurchased,
        rentalExpiresAt,
        ...chapterOffer,
      };
    }

    return {
      canRead: false,
      isLocked: true,
      lockReason: "STORY_PURCHASE_REQUIRED",
      storyPurchased,
      chapterPurchased,
      rentalExpiresAt,
      ...chapterOffer,
    };
  }

  if (!chapterOffer.requiresDirectPurchase) {
    return {
      canRead: true,
      isLocked: false,
      lockReason: null,
      storyPurchased,
      chapterPurchased,
      rentalExpiresAt,
      ...chapterOffer,
    };
  }

  return {
    canRead: false,
    isLocked: true,
    lockReason:
      chapterOffer.accessMode === CHAPTER_ACCESS_MODES.EARLY_ACCESS
        ? "EARLY_ACCESS_REQUIRED"
        : "CHAPTER_PURCHASE_REQUIRED",
    storyPurchased,
    chapterPurchased,
    rentalExpiresAt,
    ...chapterOffer,
  };
}

function roundBundlePrice(value) {
  const normalized = Math.max(0, Number(value) || 0);
  if (normalized <= 0) {
    return 0;
  }

  return Math.max(1000, Math.round(normalized / 1000) * 1000);
}

function buildChapterBundleOffers(story, chapters, entitlements = null) {
  if (!story?.chapterBundleEnabled) {
    return [];
  }

  const bundleSize = normalizeBundleSize(story?.chapterBundleSize, 3);
  const discountPercent = normalizePercent(story?.chapterBundleDiscountPercent, 15);
  const payableChapters = ensureArray(chapters)
    .map((chapter) => ({
      ...chapter,
      ...getChapterAccessOffer(chapter),
    }))
    .filter((chapter) => chapter.requiresDirectPurchase)
    .sort((left, right) => Number(left.chapterNumber || 0) - Number(right.chapterNumber || 0));

  const offers = [];
  for (let index = 0; index < payableChapters.length; index += bundleSize) {
    const group = payableChapters.slice(index, index + bundleSize);
    if (group.length < 2) {
      continue;
    }

    const chapterIds = group.map((chapter) => getChapterId(chapter)).filter(Boolean);
    const originalPrice = group.reduce((sum, chapter) => sum + normalizeCurrencyAmount(chapter.accessPrice, 0), 0);
    const discountedPrice = roundBundlePrice(
      originalPrice * ((100 - discountPercent) / 100),
    );
    const ownedCount = entitlements
      ? chapterIds.filter((chapterId) => entitlements.purchasedChapterIds.has(chapterId)).length
      : 0;

    offers.push({
      id: `${getStoryId(story)}:${chapterIds[0]}:${chapterIds[chapterIds.length - 1]}`,
      title: `Combo Ch.${group[0].chapterNumber} - Ch.${group[group.length - 1].chapterNumber}`,
      chapterIds,
      chapterStartNumber: group[0].chapterNumber,
      chapterEndNumber: group[group.length - 1].chapterNumber,
      chapterCount: group.length,
      originalPrice,
      price: discountedPrice,
      discountPercent,
      ownedCount,
      fullyOwned: ownedCount >= chapterIds.length,
    });
  }

  return offers;
}

function findBundleOfferByChapterIds(story, chapters, chapterIds) {
  const expected = uniqueStrings(chapterIds).sort();
  if (!expected.length) {
    return null;
  }

  return (
    buildChapterBundleOffers(story, chapters).find((offer) => {
      const current = [...offer.chapterIds].sort();
      if (current.length !== expected.length) {
        return false;
      }
      return current.every((chapterId, index) => chapterId === expected[index]);
    }) || null
  );
}

function buildStoryMonetizationState(story, user, entitlements) {
  const unlockPrice = normalizeCurrencyAmount(story?.unlockPrice, 0);
  const rentalPrice = normalizeCurrencyAmount(story?.rentalPrice, 0);
  const purchased = hasStoryPurchase(story, entitlements);
  const rentalExpiresAt = getActiveStoryRentalExpiry(story, entitlements);

  return {
    licensed: Boolean(story?.licensed) && unlockPrice > 0,
    unlockPrice,
    rentalEnabled: Boolean(story?.rentalEnabled) && rentalPrice > 0,
    rentalPrice,
    rentalDays: STORY_RENTAL_DURATION_DAYS,
    supportEnabled: Boolean(story?.supportEnabled),
    supportTotalAmount: normalizeCurrencyAmount(story?.supportTotalAmount, 0),
    supportCount: normalizeCurrencyAmount(story?.supportCount, 0),
    purchased,
    rentalExpiresAt,
    hasFullAccess: hasStoryFullAccess(story, user, entitlements),
  };
}

module.exports = {
  CHAPTER_ACCESS_MODES,
  CHAPTER_ACCESS_MODE_VALUES,
  STORY_RENTAL_DURATION_DAYS,
  buildChapterBundleOffers,
  buildStoryMonetizationState,
  buildUserEntitlements,
  findBundleOfferByChapterIds,
  getActiveStoryRentalExpiry,
  getChapterAccessOffer,
  hasChapterPurchase,
  hasStoryFullAccess,
  hasStoryPurchase,
  normalizeBundleSize,
  normalizeChapterAccessMode,
  normalizeCurrencyAmount,
  normalizePercent,
  resolveChapterAccess,
  sanitizeRentalEntries,
};

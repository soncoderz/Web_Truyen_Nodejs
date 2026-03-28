const DAILY_MISSION_TARGET = 3;
const DAILY_MISSION_COIN_REWARD = 120;
const DEFAULT_PROFILE_SKIN_ID = "default";
const COIN_EXCHANGE_RATE = 10;
const MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT = 1000;

const BADGE_CATALOG = [
  {
    id: "mission_day_1",
    name: "Khoi dong",
    description: "Hoan thanh nhiem vu doc dau tien.",
    requiredStreak: 1,
  },
  {
    id: "streak_3",
    name: "3 ngay lien tiep",
    description: "Giu streak doc trong 3 ngay lien tiep.",
    requiredStreak: 3,
  },
  {
    id: "streak_7",
    name: "7 ngay ben bi",
    description: "Giu streak doc trong 7 ngay lien tiep.",
    requiredStreak: 7,
  },
  {
    id: "streak_30",
    name: "Huyen thoai 30 ngay",
    description: "Giu streak doc trong 30 ngay lien tiep.",
    requiredStreak: 30,
  },
];

const PROFILE_SKIN_CATALOG = [
  {
    id: DEFAULT_PROFILE_SKIN_ID,
    name: "Mac dinh",
    description: "Skin profile co san cho moi tai khoan.",
    priceCoins: 0,
    background:
      "linear-gradient(135deg, rgba(108,99,255,0.22), rgba(15,15,26,0.92))",
    border: "rgba(108,99,255,0.38)",
    accent: "#8b5cf6",
    textColor: "#f5f3ff",
  },
  {
    id: "ember",
    name: "Ember Gold",
    description: "Gradient vang do dam cho profile noi bat.",
    priceCoins: 180,
    background:
      "linear-gradient(135deg, rgba(251,191,36,0.26), rgba(190,24,93,0.9))",
    border: "rgba(251,191,36,0.4)",
    accent: "#f59e0b",
    textColor: "#fff7ed",
  },
  {
    id: "jade",
    name: "Jade Pulse",
    description: "Tiep can xanh ngoc voi accent sang.",
    priceCoins: 260,
    background:
      "linear-gradient(135deg, rgba(16,185,129,0.24), rgba(6,95,70,0.92))",
    border: "rgba(16,185,129,0.42)",
    accent: "#10b981",
    textColor: "#ecfdf5",
  },
  {
    id: "cosmos",
    name: "Cosmos Night",
    description: "Cam giac galaxy toi voi neon xanh tim.",
    priceCoins: 320,
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.24), rgba(49,46,129,0.94))",
    border: "rgba(96,165,250,0.42)",
    accent: "#60a5fa",
    textColor: "#eff6ff",
  },
];

function asUniqueStringList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function getDateKey(date = new Date()) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
  const vietnamMs = utcMs + 7 * 60 * 60 * 1000;
  return new Date(vietnamMs).toISOString().slice(0, 10);
}

function shiftDateKey(dateKey, dayOffset) {
  if (!dateKey) {
    return null;
  }

  const [year, month, day] = String(dateKey)
    .split("-")
    .map((value) => Number.parseInt(value, 10));

  if (!year || !month || !day) {
    return null;
  }

  const shiftedDate = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return shiftedDate.toISOString().slice(0, 10);
}

function buildDefaultMissionProgress(dateKey = getDateKey()) {
  return {
    dateKey,
    chapterIds: [],
    completed: false,
    completedAt: null,
    rewardCoins: 0,
  };
}

function normalizeMissionProgress(progress, currentDateKey) {
  if (!progress || progress.dateKey !== currentDateKey) {
    return buildDefaultMissionProgress(currentDateKey);
  }

  return {
    dateKey: currentDateKey,
    chapterIds: asUniqueStringList(progress.chapterIds).slice(0, DAILY_MISSION_TARGET),
    completed: Boolean(progress.completed),
    completedAt: progress.completedAt || null,
    rewardCoins: Number(progress.rewardCoins || 0),
  };
}

function ensureRewardState(user, now = new Date()) {
  const currentDateKey = getDateKey(now);

  user.coinBalance = Number(user.coinBalance || 0);
  user.walletBalance = Number(user.walletBalance || 0);
  user.readingStreak = Number(user.readingStreak || 0);
  user.longestReadingStreak = Number(user.longestReadingStreak || 0);
  user.lastMissionCompletedDateKey = user.lastMissionCompletedDateKey || null;
  user.badges = asUniqueStringList(user.badges);
  user.ownedProfileSkinIds = asUniqueStringList(user.ownedProfileSkinIds);

  if (!user.ownedProfileSkinIds.includes(DEFAULT_PROFILE_SKIN_ID)) {
    user.ownedProfileSkinIds.unshift(DEFAULT_PROFILE_SKIN_ID);
  }

  user.equippedProfileSkinId =
    user.equippedProfileSkinId &&
    user.ownedProfileSkinIds.includes(user.equippedProfileSkinId)
      ? user.equippedProfileSkinId
      : DEFAULT_PROFILE_SKIN_ID;

  user.missionProgress = normalizeMissionProgress(user.missionProgress, currentDateKey);

  return user;
}

function getUnlockedBadgeIds(user) {
  return BADGE_CATALOG.filter(
    (badge) => Number(user.readingStreak || 0) >= badge.requiredStreak,
  )
    .map((badge) => badge.id)
    .filter((badgeId) => !user.badges.includes(badgeId));
}

function trackChapterRead(user, chapterId, now = new Date()) {
  ensureRewardState(user, now);

  const progress = user.missionProgress;
  const normalizedChapterId = String(chapterId || "").trim();
  const chapterIds = asUniqueStringList(progress.chapterIds);
  const alreadyCounted = normalizedChapterId
    ? chapterIds.includes(normalizedChapterId)
    : false;

  if (
    normalizedChapterId &&
    !alreadyCounted &&
    !progress.completed &&
    chapterIds.length < DAILY_MISSION_TARGET
  ) {
    chapterIds.push(normalizedChapterId);
  }

  progress.chapterIds = chapterIds.slice(0, DAILY_MISSION_TARGET);

  let completedNow = false;
  let rewardCoins = 0;
  let unlockedBadgeIds = [];

  if (!progress.completed && progress.chapterIds.length >= DAILY_MISSION_TARGET) {
    progress.completed = true;
    progress.completedAt = now;
    progress.rewardCoins = DAILY_MISSION_COIN_REWARD;

    user.coinBalance += DAILY_MISSION_COIN_REWARD;
    rewardCoins = DAILY_MISSION_COIN_REWARD;
    completedNow = true;

    const yesterdayKey = shiftDateKey(progress.dateKey, -1);
    user.readingStreak =
      user.lastMissionCompletedDateKey === yesterdayKey
        ? Number(user.readingStreak || 0) + 1
        : 1;
    user.lastMissionCompletedDateKey = progress.dateKey;
    user.longestReadingStreak = Math.max(
      Number(user.longestReadingStreak || 0),
      Number(user.readingStreak || 0),
    );

    unlockedBadgeIds = getUnlockedBadgeIds(user);
    if (unlockedBadgeIds.length > 0) {
      user.badges = asUniqueStringList([...user.badges, ...unlockedBadgeIds]);
    }
  }

  return {
    dateKey: progress.dateKey,
    target: DAILY_MISSION_TARGET,
    progressCount: progress.chapterIds.length,
    remainingCount: Math.max(0, DAILY_MISSION_TARGET - progress.chapterIds.length),
    completed: Boolean(progress.completed),
    completedNow,
    rewardCoins,
    streak: Number(user.readingStreak || 0),
    longestStreak: Number(user.longestReadingStreak || 0),
    unlockedBadgeIds,
    chapterAdded: Boolean(normalizedChapterId) && !alreadyCounted,
  };
}

function calculateStoryCoinPrice(story) {
  const unlockPrice = Number(story?.unlockPrice || 0);
  if (!story?.licensed || unlockPrice <= 0) {
    return 0;
  }

  return Math.max(100, Math.ceil(unlockPrice / COIN_EXCHANGE_RATE));
}

function convertWalletAmountToCoins(amount) {
  const normalizedAmount = Number(amount || 0);
  if (normalizedAmount <= 0) {
    return 0;
  }

  return Math.floor(normalizedAmount / COIN_EXCHANGE_RATE);
}

function buildBadgeList(user) {
  const unlockedBadgeIds = new Set(asUniqueStringList(user.badges));
  return BADGE_CATALOG.map((badge) => ({
    ...badge,
    unlocked: unlockedBadgeIds.has(badge.id),
  }));
}

function buildProfileSkinList(user) {
  const ownedSkinIds = new Set(asUniqueStringList(user.ownedProfileSkinIds));
  const equippedProfileSkinId =
    user.equippedProfileSkinId || DEFAULT_PROFILE_SKIN_ID;

  return PROFILE_SKIN_CATALOG.map((skin) => ({
    ...skin,
    owned: ownedSkinIds.has(skin.id),
    equipped: skin.id === equippedProfileSkinId,
  }));
}

function buildMissionSummary(user, now = new Date()) {
  ensureRewardState(user, now);
  const progress = user.missionProgress;

  return {
    dateKey: progress.dateKey,
    target: DAILY_MISSION_TARGET,
    progressCount: progress.chapterIds.length,
    remainingCount: Math.max(0, DAILY_MISSION_TARGET - progress.chapterIds.length),
    completed: Boolean(progress.completed),
    rewardCoins: progress.completed ? Number(progress.rewardCoins || 0) : DAILY_MISSION_COIN_REWARD,
    streak: Number(user.readingStreak || 0),
    longestStreak: Number(user.longestReadingStreak || 0),
  };
}

function getProfileSkinDefinition(skinId) {
  return (
    PROFILE_SKIN_CATALOG.find((skin) => skin.id === String(skinId || "")) || null
  );
}

module.exports = {
  BADGE_CATALOG,
  COIN_EXCHANGE_RATE,
  DAILY_MISSION_COIN_REWARD,
  DAILY_MISSION_TARGET,
  DEFAULT_PROFILE_SKIN_ID,
  MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT,
  PROFILE_SKIN_CATALOG,
  buildBadgeList,
  buildMissionSummary,
  buildProfileSkinList,
  calculateStoryCoinPrice,
  convertWalletAmountToCoins,
  ensureRewardState,
  getDateKey,
  getProfileSkinDefinition,
  trackChapterRead,
};

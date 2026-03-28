const DAILY_MISSION_TARGET = 3;
const DAILY_MISSION_COIN_REWARD = 120;
const DEFAULT_PROFILE_SKIN_ID = "default";
const COIN_EXCHANGE_RATE = 10;
const MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT = 1000;

const BADGE_CATALOG = [
  {
    id: "mission_day_1",
    name: "Khoi dong",
    description: "Hoàn thành nhiệm vụ đọc đầu tiên.",
    requiredStreak: 1,
  },
  {
    id: "streak_3",
    name: "3 ngày liên tiếp",
    description: "Giữ streak đọc trong 3 ngày liên tiếp.",
    requiredStreak: 3,
  },
  {
    id: "streak_7",
    name: "7 ngày bền bỉ",
    description: "Giữ streak đọc trong 7 ngày liên tiếp.",
    requiredStreak: 7,
  },
  {
    id: "streak_30",
    name: "Huyền thoại 30 ngày",
    description: "Giữ streak đọc trong 30 ngày liên tiếp.",
    requiredStreak: 30,
  },
];

const PROFILE_SKIN_CATALOG = [
  {
    id: DEFAULT_PROFILE_SKIN_ID,
    name: "Khoi Nguyen",
    tier: "Starter",
    crest: "I",
    frameVariant: "royal",
    description: "Khung mo dau gon gang, vien tron va canh nhe nhu huy hieu tan thu.",
    priceCoins: 0,
    background:
      "radial-gradient(circle at 50% 0%, rgba(149,76,233,0.34), rgba(12,13,28,0.96) 62%), linear-gradient(145deg, rgba(80,72,160,0.7), rgba(11,14,31,0.95))",
    border: "rgba(145, 92, 255, 0.42)",
    accent: "#8b5cf6",
    secondaryAccent: "#c4b5fd",
    glow: "rgba(139,92,246,0.32)",
    ribbon: "Mac dinh",
    textColor: "#f5f3ff",
  },
  {
    id: "bronze_vanguard",
    name: "Dong Ve Binh",
    tier: "Bronze",
    crest: "III",
    frameVariant: "horned",
    description: "Cap sung dong doong ve hai ben, dam chat chien binh va noi luc.",
    priceCoins: 180,
    background:
      "radial-gradient(circle at 50% 14%, rgba(255,190,92,0.38), rgba(46,20,18,0.98) 58%), linear-gradient(145deg, rgba(153,77,45,0.88), rgba(46,20,18,0.98))",
    border: "rgba(255, 168, 95, 0.45)",
    accent: "#f97316",
    secondaryAccent: "#fdba74",
    glow: "rgba(249,115,22,0.28)",
    ribbon: "Dong",
    textColor: "#fff7ed",
  },
  {
    id: "silver_court",
    name: "Bac Nguyet Dien",
    tier: "Silver",
    crest: "II",
    frameVariant: "winged",
    description: "Khung bac canh mo rong, sach va sang nhu bieu tuong bac cap.",
    priceCoins: 320,
    background:
      "radial-gradient(circle at 50% 10%, rgba(241,245,249,0.42), rgba(20,24,41,0.98) 54%), linear-gradient(145deg, rgba(126,142,171,0.88), rgba(20,24,41,0.98))",
    border: "rgba(196, 207, 224, 0.52)",
    accent: "#cbd5f5",
    secondaryAccent: "#60a5fa",
    glow: "rgba(148,163,184,0.3)",
    ribbon: "Bac",
    textColor: "#f8fbff",
  },
  {
    id: "gold_lion",
    name: "Vuong Su Hoang Kim",
    tier: "Gold",
    crest: "I",
    frameVariant: "solar",
    description: "Khung vang hoa mat troi, cac canh tia va mat ngoc day uy nghiem.",
    priceCoins: 520,
    background:
      "radial-gradient(circle at 50% 12%, rgba(255,226,122,0.5), rgba(79,29,12,0.98) 56%), linear-gradient(145deg, rgba(212,139,47,0.92), rgba(79,29,12,0.98))",
    border: "rgba(250, 204, 21, 0.58)",
    accent: "#facc15",
    secondaryAccent: "#fb7185",
    glow: "rgba(250,204,21,0.32)",
    ribbon: "Vang",
    textColor: "#fffbea",
  },
  {
    id: "emerald_vernal",
    name: "Luc Bao Mua Xuan",
    tier: "Emerald",
    crest: "E",
    frameVariant: "verdant",
    description: "Khung day leo luc bao, mem va sang nhu linh khi rung co.",
    priceCoins: 690,
    background:
      "radial-gradient(circle at 50% 12%, rgba(110,231,183,0.38), rgba(6,42,30,0.98) 58%), linear-gradient(145deg, rgba(20,130,86,0.92), rgba(6,42,30,0.98))",
    border: "rgba(74, 222, 128, 0.5)",
    accent: "#4ade80",
    secondaryAccent: "#86efac",
    glow: "rgba(34,197,94,0.28)",
    ribbon: "Luc bao",
    textColor: "#ecfdf5",
  },
  {
    id: "platinum_crown",
    name: "Bach Kim Thien Tru",
    tier: "Platinum",
    crest: "P",
    frameVariant: "tech",
    description: "Khung co khi sang xanh, thanh kim loai boc tron nhu giao dien cong nghe.",
    priceCoins: 860,
    background:
      "radial-gradient(circle at 50% 10%, rgba(153,246,228,0.38), rgba(7,39,54,0.98) 58%), linear-gradient(145deg, rgba(45,156,173,0.9), rgba(7,39,54,0.98))",
    border: "rgba(94, 234, 212, 0.5)",
    accent: "#2dd4bf",
    secondaryAccent: "#67e8f9",
    glow: "rgba(45,212,191,0.3)",
    ribbon: "Bach kim",
    textColor: "#ecfeff",
  },
  {
    id: "diamond_astral",
    name: "Kim Cuong Tinh Gioi",
    tier: "Diamond",
    crest: "D",
    frameVariant: "crystal",
    description: "Pha le xanh tim bat tung tia sang, hop voi avatar canh sac net.",
    priceCoins: 1320,
    background:
      "radial-gradient(circle at 50% 6%, rgba(191,219,254,0.42), rgba(28,25,68,0.98) 56%), linear-gradient(145deg, rgba(59,130,246,0.88), rgba(28,25,68,0.98))",
    border: "rgba(147, 197, 253, 0.56)",
    accent: "#60a5fa",
    secondaryAccent: "#a78bfa",
    glow: "rgba(96,165,250,0.34)",
    ribbon: "Kim cuong",
    textColor: "#eef4ff",
  },
  {
    id: "lunar_seraph",
    name: "Nguyet Seraph",
    tier: "Mythic",
    crest: "L",
    frameVariant: "lunar",
    description: "Canh nguyet bac tim om vien avatar, nhe va thanh nhat nhu than su.",
    priceCoins: 1580,
    background:
      "radial-gradient(circle at 50% 8%, rgba(216,180,254,0.36), rgba(24,19,52,0.99) 56%), linear-gradient(145deg, rgba(129,140,248,0.88), rgba(24,19,52,0.99))",
    border: "rgba(196, 181, 253, 0.54)",
    accent: "#c4b5fd",
    secondaryAccent: "#e9d5ff",
    glow: "rgba(168,85,247,0.3)",
    ribbon: "Nguyet",
    textColor: "#faf5ff",
  },
  {
    id: "blossom_matsuri",
    name: "Hoa Le Le Hoi",
    tier: "Festival",
    crest: "B",
    frameVariant: "blossom",
    description: "Khung hoa neon vui mat, mau tuoi va rat hop avatar phong cach cute.",
    priceCoins: 1680,
    background:
      "radial-gradient(circle at 50% 8%, rgba(251,182,206,0.42), rgba(56,18,56,0.98) 56%), linear-gradient(145deg, rgba(236,72,153,0.88), rgba(56,18,56,0.98))",
    border: "rgba(244, 114, 182, 0.56)",
    accent: "#fb7185",
    secondaryAccent: "#c084fc",
    glow: "rgba(244,114,182,0.3)",
    ribbon: "Le hoi",
    textColor: "#fff1f8",
  },
  {
    id: "master_abyss",
    name: "Cao Thu Hu Khong",
    tier: "Master",
    crest: "M",
    frameVariant: "infernal",
    description: "Sung tim do sac nhon, quanh vien la aura manh nhu top rank hung bao.",
    priceCoins: 1880,
    background:
      "radial-gradient(circle at 50% 6%, rgba(244,114,182,0.34), rgba(39,11,56,0.99) 54%), linear-gradient(145deg, rgba(109,40,217,0.92), rgba(39,11,56,0.99))",
    border: "rgba(217, 70, 239, 0.52)",
    accent: "#d946ef",
    secondaryAccent: "#fb7185",
    glow: "rgba(217,70,239,0.34)",
    ribbon: "Cao thu",
    textColor: "#fff1ff",
  },
  {
    id: "void_mecha",
    name: "Co Gioi Hu Vo",
    tier: "Cosmic",
    crest: "V",
    frameVariant: "mecha",
    description: "Khung mecha vu tru voi moc giap va den neon, rat giong frame sci-fi.",
    priceCoins: 2240,
    background:
      "radial-gradient(circle at 50% 6%, rgba(125,211,252,0.34), rgba(15,18,40,0.99) 56%), linear-gradient(145deg, rgba(58,82,160,0.92), rgba(15,18,40,0.99))",
    border: "rgba(125, 211, 252, 0.48)",
    accent: "#7dd3fc",
    secondaryAccent: "#60a5fa",
    glow: "rgba(96,165,250,0.32)",
    ribbon: "Hu vo",
    textColor: "#f0f9ff",
  },
  {
    id: "challenger_solaris",
    name: "Thach Dau Thien Nhat",
    tier: "Challenger",
    crest: "C",
    frameVariant: "crown",
    description: "Khung dinh cao vang trang, tap trung vao vuong mien va mat ngoc trung tam.",
    priceCoins: 2680,
    background:
      "radial-gradient(circle at 50% 4%, rgba(255,255,255,0.6), rgba(18,35,72,0.99) 52%), linear-gradient(145deg, rgba(34,211,238,0.88), rgba(18,35,72,0.99))",
    border: "rgba(255, 255, 255, 0.72)",
    accent: "#f8fafc",
    secondaryAccent: "#facc15",
    glow: "rgba(250,204,21,0.38)",
    ribbon: "Thach dau",
    textColor: "#f8fbff",
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


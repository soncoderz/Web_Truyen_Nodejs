const crypto = require("crypto");
const Chapter = require("../models/chapter");
const PaymentTransaction = require("../models/paymentTransaction");
const Story = require("../models/story");
const User = require("../models/user");
const env = require("../config/env");
const {
  buildBadgeList,
  buildMissionSummary,
  buildProfileSkinList,
  calculateStoryCoinPrice,
  COIN_EXCHANGE_RATE,
  convertWalletAmountToCoins,
  ensureRewardState,
  getProfileSkinDefinition,
  MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT,
} = require("../services/rewardService");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const {
  canViewStory,
  isOwner,
  isApprovedStatus,
} = require("../utils/permissions");
const { normalizeLong } = require("../utils/normalize");
const {
  STORY_RENTAL_DURATION_DAYS,
  buildStoryMonetizationState,
  buildUserEntitlements,
  findBundleOfferByChapterIds,
  hasStoryFullAccess,
  normalizeCurrencyAmount,
  resolveChapterAccess,
  sanitizeRentalEntries,
} = require("../services/monetizationService");
const httpError = require("../utils/httpError");

const PROVIDER_MOMO = "MOMO";
const PROVIDER_WALLET = "WALLET";
const PROVIDER_COINS = "COINS";
const TYPE_TOP_UP = "TOP_UP";
const TYPE_UNLOCK_STORY = "UNLOCK_STORY";
const TYPE_UNLOCK_CHAPTER = "UNLOCK_CHAPTER";
const TYPE_UNLOCK_CHAPTER_BUNDLE = "UNLOCK_CHAPTER_BUNDLE";
const TYPE_RENT_STORY = "RENT_STORY";
const TYPE_SUPPORT_AUTHOR = "SUPPORT_AUTHOR";
const TYPE_UNLOCK_PROFILE_SKIN = "UNLOCK_PROFILE_SKIN";
const TYPE_WALLET_TO_COINS = "WALLET_TO_COINS";
const STATUS_PENDING = "PENDING";
const STATUS_COMPLETED = "COMPLETED";
const STATUS_FAILED = "FAILED";

function safeWalletBalance(user) {
  return Number(user?.walletBalance || 0);
}

function safePurchasedStoryIds(user) {
  return Array.isArray(user?.purchasedStoryIds) ? [...user.purchasedStoryIds] : [];
}

function safePurchasedChapterIds(user) {
  return Array.isArray(user?.purchasedChapterIds) ? [...user.purchasedChapterIds] : [];
}

function safeRentedStoryAccesses(user) {
  return sanitizeRentalEntries(user?.rentedStoryAccesses || [])
    .filter((entry) => entry.isActive)
    .map(({ storyId, expiresAt }) => ({
      storyId,
      expiresAt,
    }));
}

function safeCoinBalance(user) {
  return Number(user?.coinBalance || 0);
}

function appendUniqueIds(existingValues, nextValues) {
  return Array.from(
    new Set([
      ...(Array.isArray(existingValues) ? existingValues : []),
      ...(Array.isArray(nextValues) ? nextValues : []),
    ]),
  );
}

function upsertStoryRentalAccess(user, storyId, expiresAt) {
  const entries = sanitizeRentalEntries(user?.rentedStoryAccesses || []);
  const remaining = entries
    .filter((entry) => entry.storyId !== storyId && entry.isActive)
    .map(({ storyId: currentStoryId, expiresAt: currentExpiresAt }) => ({
      storyId: currentStoryId,
      expiresAt: currentExpiresAt,
    }));

  remaining.push({
    storyId,
    expiresAt,
  });

  user.rentedStoryAccesses = remaining;
}

function buildCompactId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function normalizeBaseUrl(value) {
  if (!value) {
    return "";
  }

  return String(value).endsWith("/") ? String(value).slice(0, -1) : String(value);
}

function normalizeReturnPath(value) {
  if (!value || !String(value).startsWith("/") || String(value).startsWith("//")) {
    return "/profile";
  }

  return String(value);
}

function buildFrontendUrl(returnPath) {
  return `${normalizeBaseUrl(env.frontendUrl)}${normalizeReturnPath(returnPath)}`;
}

function encodeExtraData(data) {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

function hmacSha256(rawData, secretKey) {
  return crypto
    .createHmac("sha256", secretKey)
    .update(rawData, "utf8")
    .digest("hex");
}

function asText(value) {
  return value === undefined || value === null ? "" : String(value);
}

function toInt(value) {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toLong(value) {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPaymentSummary(transaction, user) {
  return {
    status: transaction.status,
    message: transaction.message,
    amount: transaction.amount,
    ...(user
      ? {
          balance: safeWalletBalance(user),
          coinBalance: safeCoinBalance(user),
        }
      : {}),
  };
}

function isMomoReady() {
  return env.isMomoConfigured && Boolean(env.frontendUrl) && Boolean(env.backendUrl);
}

/**
 * Lay thong tin vi tien, xu, giao dich tien gan day
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWallet = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  ensureRewardState(user);
  const recentTransactions = await PaymentTransaction.find({ userId: user.id })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  res.json({
    balance: safeWalletBalance(user),
    coinBalance: safeCoinBalance(user),
    coinExchangeRate: COIN_EXCHANGE_RATE,
    coinExchangeMinAmount: MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT,
    purchasedStoryIds: safePurchasedStoryIds(user),
    purchasedChapterIds: safePurchasedChapterIds(user),
    rentedStoryAccesses: safeRentedStoryAccesses(user),
    mission: buildMissionSummary(user),
    badges: buildBadgeList(user),
    profileSkins: buildProfileSkinList(user),
    equippedProfileSkinId: user.equippedProfileSkinId,
    transactions: recentTransactions.map(serializeDoc),
  });
});

// Doi tien (VND) sang xu voi ti le quy dinh
// So tien phai >= MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT va chia het cho COIN_EXCHANGE_RATE
// Vi du: COIN_EXCHANGE_RATE=100 thi chi doi duoc 100, 200, 300 VND, ko doi 150 VND
const exchangeWalletToCoins = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  ensureRewardState(user);

  const amount = normalizeLong(req.body.amount, 0);
  if (amount < MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT) {
    return res.status(400).json(
      buildMessage(
        `Lỗi: Sờ‘ tiờn đổi tối thiểu lÃ  ${MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT} VND.`,
      ),
    );
  }

  if (amount % COIN_EXCHANGE_RATE !== 0) {
    return res.status(400).json(
      buildMessage(`Lỗi: Sờ‘ tiờn đổi phải chia hết cho ${COIN_EXCHANGE_RATE} VND.`),
    );
  }

  const currentBalance = safeWalletBalance(user);
  if (currentBalance < amount) {
    return res.status(402).json({
      message: "Số dư không đủ để đổi sang xu.",
      balance: currentBalance,
      requiredAmount: amount,
    });
  }

  const coins = convertWalletAmountToCoins(amount);
  if (coins <= 0) {
    return res.status(400).json(buildMessage("Lỗi: Sờ‘ tiờn đổi không hợp lệ."));
  }

  user.walletBalance = currentBalance - amount;
  user.coinBalance = safeCoinBalance(user) + coins;
  await user.save();

  await PaymentTransaction.create({
    userId: user.id,
    type: TYPE_WALLET_TO_COINS,
    provider: PROVIDER_WALLET,
    status: STATUS_COMPLETED,
    amount,
    orderId: buildCompactId("exchange"),
    requestId: buildCompactId("exchange_req"),
    message: `Đã đổi ${amount} VND thành ${coins} xu.`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json({
    balance: safeWalletBalance(user),
    coinBalance: safeCoinBalance(user),
    exchangedAmount: amount,
    receivedCoins: coins,
    coinExchangeRate: COIN_EXCHANGE_RATE,
  });
});

// Mở khóa truyện - cho phép người dùng mua quyền truy cập toàn bộ truyện có bản quyền
// Hỗ trợ 2 phương thức thanh toán: VND (ví) hoặc XU (tiền xu)
const unlockStory = asyncHandler(async (req, res) => {
  // 1. Lấy thông tin User và Story từ Database
  const [user, story] = await Promise.all([
    getCurrentUserDocument(req),
    Story.findById(req.params.storyId),
  ]);
  ensureRewardState(user);

  // 2. Kiểm tra xem truyện có tồn tại không
  if (!story) {
    return res.status(400).json(buildMessage("Lỗi: Không tìm thấy truyện!"));
  }

  const plainStory = serializeDoc(story);
  if (!canViewStory(plainStory, req.user)) {
    return res.status(404).json(buildMessage("Lỗi: Không tìm thấy truyện!"));
  }

  const entitlements = buildUserEntitlements(user);
  const storyCommerce = buildStoryMonetizationState(plainStory, req.user, entitlements);

  if (!storyCommerce.licensed) {
    return res.json({
      unlocked: true,
      balance: safeWalletBalance(user),
      coinBalance: safeCoinBalance(user),
    });
  }

  if (storyCommerce.hasFullAccess) {
    return res.json({
      unlocked: true,
      balance: safeWalletBalance(user),
      coinBalance: safeCoinBalance(user),
      rentalExpiresAt: storyCommerce.rentalExpiresAt,
    });
  }

  const paymentMethod = String(req.body.paymentMethod || PROVIDER_WALLET).toUpperCase();
  const unlockPrice = normalizeCurrencyAmount(story.unlockPrice, 0);
  const coinPrice = calculateStoryCoinPrice(story);

  if (paymentMethod === PROVIDER_COINS) {
    const currentCoins = safeCoinBalance(user);
    if (currentCoins < coinPrice) {
      return res.status(402).json({
        message: "Số xu không đủ để mở khóa nội dung premium này.",
        coinBalance: currentCoins,
        requiredCoins: coinPrice,
      });
    }

    user.coinBalance = currentCoins - coinPrice;
    user.purchasedStoryIds = appendUniqueIds(
      safePurchasedStoryIds(user),
      [req.params.storyId],
    );
    await user.save();

    await PaymentTransaction.create({
      userId: user.id,
      storyId: req.params.storyId,
      type: TYPE_UNLOCK_STORY,
      provider: PROVIDER_COINS,
      status: STATUS_COMPLETED,
      amount: coinPrice,
      orderId: buildCompactId("unlock_coin"),
      requestId: buildCompactId("unlock_coin_req"),
      message: "Mở khóa truyện thành công bằng xu.",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.json({
      unlocked: true,
      balance: safeWalletBalance(user),
      coinBalance: safeCoinBalance(user),
      spentCoins: coinPrice,
      paymentMethod: PROVIDER_COINS,
    });
  }

  const currentBalance = safeWalletBalance(user);
  if (currentBalance < unlockPrice) {
    return res.status(402).json({
      message: "Số dư không đủ để mua truyện này.",
      balance: currentBalance,
      requiredAmount: unlockPrice,
    });
  }

  user.walletBalance = currentBalance - unlockPrice;
  user.purchasedStoryIds = appendUniqueIds(
    safePurchasedStoryIds(user),
    [req.params.storyId],
  );
  await user.save();

  await PaymentTransaction.create({
    userId: user.id,
    storyId: req.params.storyId,
    type: TYPE_UNLOCK_STORY,
    provider: PROVIDER_WALLET,
    status: STATUS_COMPLETED,
    amount: unlockPrice,
    orderId: buildCompactId("unlock"),
    requestId: buildCompactId("unlock_req"),
    message: "Mở khóa truyện thành công.",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json({
    unlocked: true,
    balance: safeWalletBalance(user),
    coinBalance: safeCoinBalance(user),
    paymentMethod: PROVIDER_WALLET,
  });
});

// Mở khóa chương - mua quyền truy cập một chương có tính phí (early access hoặc premium)
// Kiểm tra quyền truy cập và trạng thái khóa trước khi cho phép mua
const unlockChapter = asyncHandler(async (req, res) => {
  // 1. Lấy thông tin User hiện tại và Chương từ Database
  const [user, chapter] = await Promise.all([
    getCurrentUserDocument(req),
    Chapter.findById(req.params.chapterId),
  ]);
  ensureRewardState(user);

  // 2. Kiểm tra chương có tồn tại không
  if (!chapter) {
    return res.status(400).json(buildMessage("Lỗi: Khong tim thay chuong."));
  }

  // 3. Lấy thông tin Truyện mà Chương này thuộc về
  const story = await Story.findById(chapter.storyId);
  if (!story) {
    return res.status(400).json(buildMessage("Lỗi: Khong tim thay truyen."));
  }

  const plainStory = serializeDoc(story);
  if (!canViewStory(plainStory, req.user)) {
    return res.status(404).json(buildMessage("Lỗi: Khong tim thay truyen."));
  }

  const entitlements = buildUserEntitlements(user);
  const access = resolveChapterAccess(chapter, plainStory, req.user, entitlements);

  if (access.canRead) {
    return res.json({
      unlocked: true,
      balance: safeWalletBalance(user),
      coinBalance: safeCoinBalance(user),
    });
  }

  if (!access.accessPrice || access.accessMode === "FREE") {
    return res.status(400).json({
      message: "Chương này không hỗ trợ mở khóa riêng.",
    });
  }

  const currentBalance = safeWalletBalance(user);
  if (currentBalance < access.accessPrice) {
    return res.status(402).json({
      message: "Số dư không đủ để mở khóa chương này.",
      balance: currentBalance,
      requiredAmount: access.accessPrice,
    });
  }

  user.walletBalance = currentBalance - access.accessPrice;
  user.purchasedChapterIds = appendUniqueIds(
    safePurchasedChapterIds(user),
    [req.params.chapterId],
  );
  await user.save();

  await PaymentTransaction.create({
    userId: user.id,
    storyId: String(story._id),
    chapterId: req.params.chapterId,
    type: TYPE_UNLOCK_CHAPTER,
    provider: PROVIDER_WALLET,
    status: STATUS_COMPLETED,
    amount: access.accessPrice,
    orderId: buildCompactId("unlock_chapter"),
    requestId: buildCompactId("unlock_chapter_req"),
    message:
      access.accessMode === "EARLY_ACCESS"
        ? "Mở khóa chuong early access thành công."
        : "Mở khóa chuong thành công.",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json({
    unlocked: true,
    balance: safeWalletBalance(user),
    coinBalance: safeCoinBalance(user),
    chapterId: req.params.chapterId,
  });
});

/**
 * Mo khoa goi combo cac chuong voi gia uu dai
 * @param {Object} req - Express request object, chua storyId trong params, chapterIds trong body
 * @param {Object} res - Express response object
 */
const unlockChapterBundle = asyncHandler(async (req, res) => {
  const [user, story, chapters] = await Promise.all([
    getCurrentUserDocument(req),
    Story.findById(req.params.storyId),
    Chapter.find({ storyId: req.params.storyId }).lean(),
  ]);
  ensureRewardState(user);

  if (!story) {
    return res.status(400).json(buildMessage("Lỗi: Khong tim thay truyen."));
  }

  const plainStory = serializeDoc(story);
  if (!canViewStory(plainStory, req.user)) {
    return res.status(404).json(buildMessage("Lỗi: Khong tim thay truyen."));
  }

  const entitlements = buildUserEntitlements(user);
  if (hasStoryFullAccess(plainStory, req.user, entitlements)) {
    return res.json({
      unlocked: true,
      balance: safeWalletBalance(user),
      coinBalance: safeCoinBalance(user),
    });
  }

  const visibleChapters = chapters.filter((chapter) => isApprovedStatus(chapter.approvalStatus));
  const bundleOffer = findBundleOfferByChapterIds(
    plainStory,
    visibleChapters,
    req.body.chapterIds,
  );

  if (!bundleOffer) {
    return res.status(400).json({
      message: "Combo chương không hợp lệ hoặc đã thay đổi.",
    });
  }

  const chapterIdsToGrant = bundleOffer.chapterIds.filter(
    (chapterId) => !entitlements.purchasedChapterIds.has(chapterId),
  );

  if (chapterIdsToGrant.length === 0) {
    return res.json({
      unlocked: true,
      balance: safeWalletBalance(user),
      coinBalance: safeCoinBalance(user),
      chapterIds: bundleOffer.chapterIds,
    });
  }

  const currentBalance = safeWalletBalance(user);
  if (currentBalance < bundleOffer.price) {
    return res.status(402).json({
      message: "Số dư không đủ để mua combo chương này.",
      balance: currentBalance,
      requiredAmount: bundleOffer.price,
    });
  }

  user.walletBalance = currentBalance - bundleOffer.price;
  user.purchasedChapterIds = appendUniqueIds(
    safePurchasedChapterIds(user),
    chapterIdsToGrant,
  );
  await user.save();

  await PaymentTransaction.create({
    userId: user.id,
    storyId: req.params.storyId,
    chapterIds: chapterIdsToGrant,
    type: TYPE_UNLOCK_CHAPTER_BUNDLE,
    provider: PROVIDER_WALLET,
    status: STATUS_COMPLETED,
    amount: bundleOffer.price,
    orderId: buildCompactId("unlock_bundle"),
    requestId: buildCompactId("unlock_bundle_req"),
    message: `Mở khóa ${bundleOffer.title} thành công.`,
    metadata: {
      bundleId: bundleOffer.id,
      chapterCount: bundleOffer.chapterCount,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json({
    unlocked: true,
    balance: safeWalletBalance(user),
    coinBalance: safeCoinBalance(user),
    chapterIds: chapterIdsToGrant,
    bundleId: bundleOffer.id,
  });
});

const rentStory = asyncHandler(async (req, res) => {
  const [user, story] = await Promise.all([
    getCurrentUserDocument(req),
    Story.findById(req.params.storyId),
  ]);
  ensureRewardState(user);

  if (!story) {
    return res.status(400).json(buildMessage("Lỗi: Khong tim thay truyen."));
  }

  const plainStory = serializeDoc(story);
  if (!canViewStory(plainStory, req.user)) {
    return res.status(404).json(buildMessage("Lỗi: Khong tim thay truyen."));
  }

  const entitlements = buildUserEntitlements(user);
  const storyCommerce = buildStoryMonetizationState(plainStory, req.user, entitlements);

  if (!storyCommerce.rentalEnabled) {
    return res.status(400).json({
      message: "Truyện này không hỗ trợ thuê 7 ngày.",
    });
  }

  if (storyCommerce.hasFullAccess) {
    return res.json({
      rented: true,
      balance: safeWalletBalance(user),
      coinBalance: safeCoinBalance(user),
      expiresAt: storyCommerce.rentalExpiresAt,
    });
  }

  const currentBalance = safeWalletBalance(user);
  if (currentBalance < storyCommerce.rentalPrice) {
    return res.status(402).json({
      message: "Số dư không đủ để thuê truyện này.",
      balance: currentBalance,
      requiredAmount: storyCommerce.rentalPrice,
    });
  }

  const expiresAt = new Date(
    Date.now() + STORY_RENTAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );

  user.walletBalance = currentBalance - storyCommerce.rentalPrice;
  upsertStoryRentalAccess(user, req.params.storyId, expiresAt);
  await user.save();

  await PaymentTransaction.create({
    userId: user.id,
    storyId: req.params.storyId,
    type: TYPE_RENT_STORY,
    provider: PROVIDER_WALLET,
    status: STATUS_COMPLETED,
    amount: storyCommerce.rentalPrice,
    expiresAt,
    orderId: buildCompactId("rent_story"),
    requestId: buildCompactId("rent_story_req"),
    message: `Thuê truyện ${STORY_RENTAL_DURATION_DAYS} ngày thành công.`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json({
    rented: true,
    balance: safeWalletBalance(user),
    coinBalance: safeCoinBalance(user),
    expiresAt,
    rentalDays: STORY_RENTAL_DURATION_DAYS,
  });
});

const supportAuthor = asyncHandler(async (req, res) => {
  const [user, story] = await Promise.all([
    getCurrentUserDocument(req),
    Story.findById(req.params.storyId),
  ]);
  ensureRewardState(user);

  if (!story) {
    return res.status(400).json(buildMessage("Lỗi: Khong tim thay truyen."));
  }

  const plainStory = serializeDoc(story);
  if (!canViewStory(plainStory, req.user)) {
    return res.status(404).json(buildMessage("Lỗi: Khong tim thay truyen."));
  }

  if (!story.supportEnabled) {
    return res.status(400).json({
      message: "Truyện này hiện không mở ủng hộ tác giả.",
    });
  }

  if (isOwner(plainStory, req.user)) {
    return res.status(400).json({
      message: "Bạn không thể tự ủng hộ chính mình.",
    });
  }

  const amount = normalizeCurrencyAmount(req.body.amount, 0);
  if (amount < 1000) {
    return res.status(400).json({
      message: "Số tiền ủng hộ tối thiểu là 1.000 VND.",
    });
  }

  const currentBalance = safeWalletBalance(user);
  if (currentBalance < amount) {
    return res.status(402).json({
      message: "Số dư không đủ để ủng hộ tác giả.",
      balance: currentBalance,
      requiredAmount: amount,
    });
  }

  const author = story.uploaderId ? await User.findById(story.uploaderId) : null;

  user.walletBalance = currentBalance - amount;
  story.supportTotalAmount = normalizeCurrencyAmount(story.supportTotalAmount, 0) + amount;
  story.supportCount = normalizeCurrencyAmount(story.supportCount, 0) + 1;

  if (author) {
    author.walletBalance = safeWalletBalance(author) + amount;
    await Promise.all([user.save(), story.save(), author.save()]);
  } else {
    await Promise.all([user.save(), story.save()]);
  }

  await PaymentTransaction.create({
    userId: user.id,
    targetUserId: story.uploaderId || null,
    storyId: req.params.storyId,
    type: TYPE_SUPPORT_AUTHOR,
    provider: PROVIDER_WALLET,
    status: STATUS_COMPLETED,
    amount,
    orderId: buildCompactId("support_story"),
    requestId: buildCompactId("support_story_req"),
    message: "Ủng hộ tác giả thành công.",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json({
    supported: true,
    balance: safeWalletBalance(user),
    coinBalance: safeCoinBalance(user),
    supportTotalAmount: story.supportTotalAmount,
    supportCount: story.supportCount,
  });
});

const unlockProfileSkin = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  ensureRewardState(user);

  const skin = getProfileSkinDefinition(req.params.skinId);
  if (!skin) {
    return res.status(400).json(buildMessage("Lỗi: Không tìm thấy skin hồ sơ!"));
  }

  if (skin.priceCoins <= 0) {
    return res.status(400).json(buildMessage("Lỗi: Skin hồ sơ này đã miễn phí."));
  }

  const ownedSkinIds = new Set(user.ownedProfileSkinIds || []);
  if (ownedSkinIds.has(skin.id)) {
    return res.json({
      coinBalance: safeCoinBalance(user),
      profileSkins: buildProfileSkinList(user),
      equippedProfileSkinId: user.equippedProfileSkinId,
    });
  }

  const currentCoins = safeCoinBalance(user);
  if (currentCoins < skin.priceCoins) {
    return res.status(402).json({
      message: "Số xu không đủ để mở khóa skin này.",
      coinBalance: currentCoins,
      requiredCoins: skin.priceCoins,
    });
  }

  user.coinBalance = currentCoins - skin.priceCoins;
  user.ownedProfileSkinIds = Array.from(ownedSkinIds).concat(skin.id);
  await user.save();

  await PaymentTransaction.create({
    userId: user.id,
    type: TYPE_UNLOCK_PROFILE_SKIN,
    provider: PROVIDER_COINS,
    status: STATUS_COMPLETED,
    amount: skin.priceCoins,
    orderId: buildCompactId("skin"),
    requestId: buildCompactId("skin_req"),
    message: `Mở khóa skin hồ sơ ${skin.id} thành công.`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json({
    coinBalance: safeCoinBalance(user),
    profileSkins: buildProfileSkinList(user),
    equippedProfileSkinId: user.equippedProfileSkinId,
  });
});

const equipProfileSkin = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  ensureRewardState(user);

  const skin = getProfileSkinDefinition(req.params.skinId);
  if (!skin) {
    return res.status(400).json(buildMessage("Lỗi: Không tìm thấy skin hồ sơ!"));
  }

  if (!(user.ownedProfileSkinIds || []).includes(skin.id)) {
    return res
      .status(400)
      .json(buildMessage("Lỗi: Skin hồ sơ này chưa được mờŸ khóa."));
  }

  user.equippedProfileSkinId = skin.id;
  await user.save();

  res.json({
    coinBalance: safeCoinBalance(user),
    profileSkins: buildProfileSkinList(user),
    equippedProfileSkinId: user.equippedProfileSkinId,
  });
});

const createMomoTopUp = asyncHandler(async (req, res) => {
  if (!isMomoReady()) {
    return res.status(503).json(buildMessage("Lỗi: MoMo chưa được cấu hình."));
  }

  const user = await getCurrentUserDocument(req);
  const amount = normalizeLong(req.body.amount, 0);
  if (amount < 1000) {
    return res
      .status(400)
      .json(buildMessage("Lỗi: Số tiền nạp tối thiểu là 1.000 VND."));
  }

  const orderId = buildCompactId("topup");
  const requestId = buildCompactId("req");
  const redirectUrl = buildFrontendUrl(req.body.returnPath);
  const ipnUrl = `${normalizeBaseUrl(env.backendUrl)}/api/payments/momo/ipn`;
  const orderInfo = "nạp ví Web Truyện Online";
  const extraData = encodeExtraData({
    userId: user.id,
    type: TYPE_TOP_UP,
    amount,
  });

  const rawSignature =
    `accessKey=${env.momoAccessKey}` +
    `&amount=${amount}` +
    `&extraData=${extraData}` +
    `&ipnUrl=${ipnUrl}` +
    `&orderId=${orderId}` +
    `&orderInfo=${orderInfo}` +
    `&partnerCode=${env.momoPartnerCode}` +
    `&redirectUrl=${redirectUrl}` +
    `&requestId=${requestId}` +
    `&requestType=captureWallet`;

  const payload = {
    partnerCode: env.momoPartnerCode,
    requestType: "captureWallet",
    ipnUrl,
    redirectUrl,
    orderId,
    amount,
    orderInfo,
    requestId,
    extraData,
    lang: "vi",
    signature: hmacSha256(rawSignature, env.momoSecretKey),
    ...(env.momoPartnerName ? { partnerName: env.momoPartnerName } : {}),
    ...(env.momoStoreId ? { storeId: env.momoStoreId } : {}),
  };

  try {
    const momoResponse = await fetch(env.momoEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await momoResponse.json();
    const resultCode = toInt(responseBody.resultCode);
    const message = asText(responseBody.message);
    const payUrl = asText(responseBody.payUrl);

    if (!momoResponse.ok || resultCode !== 0 || !payUrl) {
      return res.status(400).json({
        message: message || "Không tạo được link thanh toán MoMo.",
        resultCode,
      });
    }

    await PaymentTransaction.create({
      userId: user.id,
      type: TYPE_TOP_UP,
      provider: PROVIDER_MOMO,
      status: STATUS_PENDING,
      amount,
      orderId,
      requestId,
      payUrl,
      message,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.json({
      payUrl,
      orderId,
      requestId,
    });
  } catch (error) {
    return res
      .status(502)
      .json(buildMessage(`Error: Could not connect thành MoMo. ${error.message}`));
  }
});

async function processMomoCallback(payload) {
  if (!env.isMomoConfigured) {
    throw httpError(503, "Lỗi: MoMo chưa được cấu hình.");
  }

  const receivedSignature = asText(payload.signature);
  if (!receivedSignature) {
    throw httpError(400, "Lỗi: Thiếu chữ ký MoMo.");
  }

  const rawSignature =
    `accessKey=${env.momoAccessKey}` +
    `&amount=${asText(payload.amount)}` +
    `&extraData=${asText(payload.extraData)}` +
    `&message=${asText(payload.message)}` +
    `&orderId=${asText(payload.orderId)}` +
    `&orderInfo=${asText(payload.orderInfo)}` +
    `&orderType=${asText(payload.orderType)}` +
    `&partnerCode=${asText(payload.partnerCode)}` +
    `&payType=${asText(payload.payType)}` +
    `&requestId=${asText(payload.requestId)}` +
    `&responseTime=${asText(payload.responseTime)}` +
    `&resultCode=${asText(payload.resultCode)}` +
    `&transId=${asText(payload.transId)}`;

  const expectedSignature = hmacSha256(rawSignature, env.momoSecretKey);
  if (expectedSignature !== receivedSignature) {
    throw httpError(400, "Lỗi: Chờ¯ ký MoMo không hợp lệ.");
  }

  const transaction = await PaymentTransaction.findOne({
    orderId: asText(payload.orderId),
  });
  if (!transaction) {
    throw httpError(404, "Lỗi: Không tìm thấy giao dịch thanh toán.");
  }

  transaction.providerTransactionId = toLong(payload.transId);
  transaction.message = asText(payload.message);
  transaction.updatedAt = new Date();

  let user = transaction.userId ? await User.findById(transaction.userId) : null;
  if (transaction.status === STATUS_COMPLETED) {
    return buildPaymentSummary(transaction, user);
  }

  if (toInt(payload.resultCode) === 0) {
    if (transaction.type === TYPE_TOP_UP && user) {
      user.walletBalance = safeWalletBalance(user) + normalizeLong(transaction.amount, 0);
      await user.save();
    }
    transaction.status = STATUS_COMPLETED;
  } else {
    transaction.status = STATUS_FAILED;
  }

  await transaction.save();
  if (!user && transaction.userId) {
    user = await User.findById(transaction.userId);
  }

  return buildPaymentSummary(transaction, user);
}

const momoIpn = asyncHandler(async (req, res) => {
  res.json(await processMomoCallback(req.body || {}));
});

const momoConfirm = asyncHandler(async (req, res) => {
  res.json(await processMomoCallback(req.body || {}));
});

module.exports = {
  getWallet,
  exchangeWalletToCoins,
  unlockStory,
  unlockChapter,
  unlockChapterBundle,
  rentStory,
  supportAuthor,
  unlockProfileSkin,
  equipProfileSkin,
  createMomoTopUp,
  momoIpn,
  momoConfirm,
};

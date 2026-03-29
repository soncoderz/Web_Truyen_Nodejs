const crypto = require("crypto");
const express = require("express");
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
const { requireAuth } = require("../middleware/auth");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const { canViewStory, isAdmin, isOwner, isApprovedStatus } = require("../utils/permissions");
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

const router = express.Router();

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
    new Set([...(Array.isArray(existingValues) ? existingValues : []), ...(Array.isArray(nextValues) ? nextValues : [])]),
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
  return (
    env.isMomoConfigured &&
    Boolean(env.frontendUrl) &&
    Boolean(env.backendUrl)
  );
}

router.get(
  "/wallet",
  requireAuth,
  asyncHandler(async (req, res) => {
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
  }),
);

router.post(
  "/coins/exchange",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    ensureRewardState(user);

    const amount = normalizeLong(req.body.amount, 0);
    if (amount < MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT) {
      return res.status(400).json(
        buildMessage(
          `Lỗi: Số tiền đổi tối thiểu là ${MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT} VND.`,
        ),
      );
    }

    if (amount % COIN_EXCHANGE_RATE !== 0) {
      return res.status(400).json(
        buildMessage(`Lỗi: Số tiền đổi phải chia hết cho ${COIN_EXCHANGE_RATE} VND.`),
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
      return res.status(400).json(buildMessage("Lỗi: Số tiền đổi không hợp lệ."));
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
  }),
);

router.post(
  "/stories/:storyId/unlock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [user, story] = await Promise.all([
      getCurrentUserDocument(req),
      Story.findById(req.params.storyId),
    ]);
    ensureRewardState(user);

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
          message: "So xu khong du de mo khoa noi dung premium nay.",
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
        message: "Unlock story successfully with xu.",
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
  }),
);

router.post(
  "/chapters/:chapterId/unlock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [user, chapter] = await Promise.all([
      getCurrentUserDocument(req),
      Chapter.findById(req.params.chapterId),
    ]);
    ensureRewardState(user);

    if (!chapter) {
      return res.status(400).json(buildMessage("Loi: Khong tim thay chuong."));
    }

    const story = await Story.findById(chapter.storyId);
    if (!story) {
      return res.status(400).json(buildMessage("Loi: Khong tim thay truyen."));
    }

    const plainStory = serializeDoc(story);
    if (!canViewStory(plainStory, req.user)) {
      return res.status(404).json(buildMessage("Loi: Khong tim thay truyen."));
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
        message: "Chuong nay khong ho tro mo khoa rieng.",
      });
    }

    const currentBalance = safeWalletBalance(user);
    if (currentBalance < access.accessPrice) {
      return res.status(402).json({
        message: "So du khong du de mo khoa chuong nay.",
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
          ? "Mo khoa chuong early access thanh cong."
          : "Mo khoa chuong thanh cong.",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json({
      unlocked: true,
      balance: safeWalletBalance(user),
      coinBalance: safeCoinBalance(user),
      chapterId: req.params.chapterId,
    });
  }),
);

router.post(
  "/stories/:storyId/chapter-bundles/unlock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [user, story, chapters] = await Promise.all([
      getCurrentUserDocument(req),
      Story.findById(req.params.storyId),
      Chapter.find({ storyId: req.params.storyId }).lean(),
    ]);
    ensureRewardState(user);

    if (!story) {
      return res.status(400).json(buildMessage("Loi: Khong tim thay truyen."));
    }

    const plainStory = serializeDoc(story);
    if (!canViewStory(plainStory, req.user)) {
      return res.status(404).json(buildMessage("Loi: Khong tim thay truyen."));
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
        message: "Combo chuong khong hop le hoac da thay doi.",
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
        message: "So du khong du de mua combo chuong nay.",
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
      message: `Mo khoa ${bundleOffer.title} thanh cong.`,
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
  }),
);

router.post(
  "/stories/:storyId/rent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [user, story] = await Promise.all([
      getCurrentUserDocument(req),
      Story.findById(req.params.storyId),
    ]);
    ensureRewardState(user);

    if (!story) {
      return res.status(400).json(buildMessage("Loi: Khong tim thay truyen."));
    }

    const plainStory = serializeDoc(story);
    if (!canViewStory(plainStory, req.user)) {
      return res.status(404).json(buildMessage("Loi: Khong tim thay truyen."));
    }

    const entitlements = buildUserEntitlements(user);
    const storyCommerce = buildStoryMonetizationState(plainStory, req.user, entitlements);

    if (!storyCommerce.rentalEnabled) {
      return res.status(400).json({
        message: "Truyen nay khong ho tro thue 7 ngay.",
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
        message: "So du khong du de thue truyen nay.",
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
      message: `Thue truyen ${STORY_RENTAL_DURATION_DAYS} ngay thanh cong.`,
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
  }),
);

router.post(
  "/stories/:storyId/support",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [user, story] = await Promise.all([
      getCurrentUserDocument(req),
      Story.findById(req.params.storyId),
    ]);
    ensureRewardState(user);

    if (!story) {
      return res.status(400).json(buildMessage("Loi: Khong tim thay truyen."));
    }

    const plainStory = serializeDoc(story);
    if (!canViewStory(plainStory, req.user)) {
      return res.status(404).json(buildMessage("Loi: Khong tim thay truyen."));
    }

    if (!story.supportEnabled) {
      return res.status(400).json({
        message: "Truyen nay hien khong mo ung ho tac gia.",
      });
    }

    if (isOwner(plainStory, req.user)) {
      return res.status(400).json({
        message: "Ban khong the tu ung ho chinh minh.",
      });
    }

    const amount = normalizeCurrencyAmount(req.body.amount, 0);
    if (amount < 1000) {
      return res.status(400).json({
        message: "So tien ung ho toi thieu la 1.000 VND.",
      });
    }

    const currentBalance = safeWalletBalance(user);
    if (currentBalance < amount) {
      return res.status(402).json({
        message: "So du khong du de ung ho tac gia.",
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
      message: "Ung ho tac gia thanh cong.",
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
  }),
);

router.post(
  "/skins/:skinId/unlock",
  requireAuth,
  asyncHandler(async (req, res) => {
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
        message: "So xu khong du de mo khoa skin nay.",
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
  }),
);

router.put(
  "/skins/:skinId/equip",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    ensureRewardState(user);

    const skin = getProfileSkinDefinition(req.params.skinId);
    if (!skin) {
      return res.status(400).json(buildMessage("Lỗi: Không tìm thấy skin hồ sơ!"));
    }

    if (!(user.ownedProfileSkinIds || []).includes(skin.id)) {
      return res.status(400).json(buildMessage("Lỗi: Skin hồ sơ này chưa được mở khóa."));
    }

    user.equippedProfileSkinId = skin.id;
    await user.save();

    res.json({
      coinBalance: safeCoinBalance(user),
      profileSkins: buildProfileSkinList(user),
      equippedProfileSkinId: user.equippedProfileSkinId,
    });
  }),
);

router.post(
  "/momo/top-up",
  requireAuth,
  asyncHandler(async (req, res) => {
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
    const orderInfo = "Nap vi Web Tuyen Online";
    const extraData = encodeExtraData({
      userId: user.id,
      type: TYPE_TOP_UP,
      amount,
    });

    const rawSignature = `accessKey=${env.momoAccessKey}` +
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
  }),
);

async function processMomoCallback(payload) {
  if (!env.isMomoConfigured) {
    throw httpError(503, "Lỗi: MoMo chưa được cấu hình.");
  }

  const receivedSignature = asText(payload.signature);
  if (!receivedSignature) {
    throw httpError(400, "Lỗi: Thiếu chữ ký MoMo.");
  }

  const rawSignature = `accessKey=${env.momoAccessKey}` +
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
    throw httpError(400, "Lỗi: Chữ ký MoMo không hợp lệ.");
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

router.post(
  "/momo/ipn",
  asyncHandler(async (req, res) => {
    res.json(await processMomoCallback(req.body || {}));
  }),
);

router.post(
  "/momo/confirm",
  asyncHandler(async (req, res) => {
    res.json(await processMomoCallback(req.body || {}));
  }),
);

module.exports = router;

const crypto = require("crypto");
const express = require("express");
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
const httpError = require("../utils/httpError");

const router = express.Router();

const PROVIDER_MOMO = "MOMO";
const PROVIDER_WALLET = "WALLET";
const PROVIDER_COINS = "COINS";
const TYPE_TOP_UP = "TOP_UP";
const TYPE_UNLOCK_STORY = "UNLOCK_STORY";
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

function safeCoinBalance(user) {
  return Number(user?.coinBalance || 0);
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
          `Error: Minimum exchange amount is ${MIN_WALLET_TO_COINS_EXCHANGE_AMOUNT} VND.`,
        ),
      );
    }

    if (amount % COIN_EXCHANGE_RATE !== 0) {
      return res.status(400).json(
        buildMessage(`Error: Exchange amount must be divisible by ${COIN_EXCHANGE_RATE} VND.`),
      );
    }

    const currentBalance = safeWalletBalance(user);
    if (currentBalance < amount) {
      return res.status(402).json({
        message: "So du khong du de doi sang xu.",
        balance: currentBalance,
        requiredAmount: amount,
      });
    }

    const coins = convertWalletAmountToCoins(amount);
    if (coins <= 0) {
      return res.status(400).json(buildMessage("Error: Invalid exchange amount."));
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
      message: `Converted ${amount} VND to ${coins} coins.`,
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
      return res.status(400).json(buildMessage("Error: Story not found!"));
    }

    const plainStory = serializeDoc(story);
    if (!canViewStory(plainStory, req.user)) {
      return res.status(404).json(buildMessage("Error: Story not found!"));
    }

    if (!story.licensed || normalizeLong(story.unlockPrice, 0) <= 0) {
      return res.json({
        unlocked: true,
        balance: safeWalletBalance(user),
      });
    }

    if (isAdmin(req.user) || isOwner(plainStory, req.user)) {
      return res.json({
        unlocked: true,
        balance: safeWalletBalance(user),
      });
    }

    const purchasedStoryIds = safePurchasedStoryIds(user);
    if (purchasedStoryIds.includes(req.params.storyId)) {
      return res.json({
        unlocked: true,
        balance: safeWalletBalance(user),
        coinBalance: safeCoinBalance(user),
      });
    }

    const paymentMethod = String(req.body.paymentMethod || PROVIDER_WALLET).toUpperCase();
    const unlockPrice = normalizeLong(story.unlockPrice, 0);
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
      user.purchasedStoryIds = [...purchasedStoryIds, req.params.storyId];
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
        message: "Unlock story successfully with coins.",
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
        message: "So du khong du de mua truyen nay.",
        balance: currentBalance,
        requiredAmount: unlockPrice,
      });
    }

    user.walletBalance = currentBalance - unlockPrice;
    user.purchasedStoryIds = [...purchasedStoryIds, req.params.storyId];
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
      message: "Unlock story successfully.",
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
  "/skins/:skinId/unlock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    ensureRewardState(user);

    const skin = getProfileSkinDefinition(req.params.skinId);
    if (!skin) {
      return res.status(400).json(buildMessage("Error: Profile skin not found!"));
    }

    if (skin.priceCoins <= 0) {
      return res.status(400).json(buildMessage("Error: This profile skin is already free."));
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
      message: `Unlock profile skin ${skin.id} successfully.`,
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
      return res.status(400).json(buildMessage("Error: Profile skin not found!"));
    }

    if (!(user.ownedProfileSkinIds || []).includes(skin.id)) {
      return res.status(400).json(buildMessage("Error: Profile skin has not been unlocked."));
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
      return res.status(503).json(buildMessage("Error: MoMo is not configured."));
    }

    const user = await getCurrentUserDocument(req);
    const amount = normalizeLong(req.body.amount, 0);
    if (amount < 1000) {
      return res
        .status(400)
        .json(buildMessage("Error: Minimum top-up amount is 1000 VND."));
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
          message: message || "Khong tao duoc link thanh toan MoMo.",
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
        .json(buildMessage(`Error: Could not connect to MoMo. ${error.message}`));
    }
  }),
);

async function processMomoCallback(payload) {
  if (!env.isMomoConfigured) {
    throw httpError(503, "Error: MoMo is not configured.");
  }

  const receivedSignature = asText(payload.signature);
  if (!receivedSignature) {
    throw httpError(400, "Error: Missing MoMo signature.");
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
    throw httpError(400, "Error: Invalid MoMo signature.");
  }

  const transaction = await PaymentTransaction.findOne({
    orderId: asText(payload.orderId),
  });
  if (!transaction) {
    throw httpError(404, "Error: Payment transaction not found.");
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

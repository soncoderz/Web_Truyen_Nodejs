const express = require("express");
const paymentsController = require("../controllers/paymentsController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/wallet", requireAuth, paymentsController.getWallet);
router.post("/coins/exchange", requireAuth, paymentsController.exchangeWalletToCoins);
router.post("/stories/:storyId/unlock", requireAuth, paymentsController.unlockStory);
router.post("/chapters/:chapterId/unlock", requireAuth, paymentsController.unlockChapter);
router.post(
  "/stories/:storyId/chapter-bundles/unlock",
  requireAuth,
  paymentsController.unlockChapterBundle,
);
router.post("/stories/:storyId/rent", requireAuth, paymentsController.rentStory);
router.post("/stories/:storyId/support", requireAuth, paymentsController.supportAuthor);
router.post("/skins/:skinId/unlock", requireAuth, paymentsController.unlockProfileSkin);
router.put("/skins/:skinId/equip", requireAuth, paymentsController.equipProfileSkin);
router.post("/momo/top-up", requireAuth, paymentsController.createMomoTopUp);
router.post("/momo/ipn", paymentsController.momoIpn);
router.post("/momo/confirm", paymentsController.momoConfirm);

module.exports = router;

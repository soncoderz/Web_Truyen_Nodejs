const express = require("express");
const emailController = require("../controllers/emailController");

const router = express.Router();

router.post("/send-simple", emailController.sendSimple);
router.post("/send-html", emailController.sendHtml);
router.post("/send-verification", emailController.sendVerification);
router.post("/send-notification", emailController.sendNotification);
router.get("/health", emailController.health);

module.exports = router;

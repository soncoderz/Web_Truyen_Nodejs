const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const {
  sendHtmlEmail,
  sendNotificationEmail,
  sendSimpleEmail,
  sendVerificationEmail,
} = require("../services/emailService");

const router = express.Router();

function pickValue(req, key) {
  return req.body?.[key] ?? req.query?.[key];
}

router.post(
  "/send-simple",
  asyncHandler(async (req, res) => {
    const success = await sendSimpleEmail(
      pickValue(req, "toEmail"),
      pickValue(req, "subject"),
      pickValue(req, "content"),
    );

    res.status(success ? 200 : 400).json({
      success,
      message: success
        ? "Email da duoc gui thanh cong!"
        : "Khong the gui email. Vui long kiem tra API key.",
    });
  }),
);

router.post(
  "/send-html",
  asyncHandler(async (req, res) => {
    const success = await sendHtmlEmail(
      pickValue(req, "toEmail"),
      pickValue(req, "toName"),
      pickValue(req, "subject"),
      pickValue(req, "htmlContent"),
    );

    res.status(success ? 200 : 400).json({
      success,
      message: success
        ? "Email HTML da duoc gui thanh cong!"
        : "Khong the gui email. Vui long kiem tra API key.",
    });
  }),
);

router.post(
  "/send-verification",
  asyncHandler(async (req, res) => {
    const success = await sendVerificationEmail(
      pickValue(req, "toEmail"),
      pickValue(req, "verificationLink"),
    );

    res.status(success ? 200 : 400).json({
      success,
      message: success
        ? "Email xac minh da duoc gui thanh cong!"
        : "Khong the gui email xac minh.",
    });
  }),
);

router.post(
  "/send-notification",
  asyncHandler(async (req, res) => {
    const success = await sendNotificationEmail(
      pickValue(req, "toEmail"),
      pickValue(req, "title"),
      pickValue(req, "message"),
    );

    res.status(success ? 200 : 400).json({
      success,
      message: success
        ? "Email thong bao da duoc gui thanh cong!"
        : "Khong the gui email thong bao.",
    });
  }),
);

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Email service is running",
  });
});

module.exports = router;

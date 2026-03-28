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
        ? "Email đã được gửi thành công!"
        : "Không thể gửi email. Vui lòng kiểm tra API key.",
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
        ? "Email HTML đã được gửi thành công!"
        : "Không thể gửi email. Vui lòng kiểm tra API key.",
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
        ? "Email xác minh đã được gửi thành công!"
        : "Không thể gửi email xác minh.",
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
        ? "Email thông báo đã được gửi thành công!"
        : "Không thể gửi email thông báo.",
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

const asyncHandler = require("../utils/asyncHandler");
const {
  sendHtmlEmail,
  sendNotificationEmail,
  sendSimpleEmail,
  sendVerificationEmail,
} = require("../services/emailService");

function pickValue(req, key) {
  return req.body?.[key] ?? req.query?.[key];
}

const sendSimple = asyncHandler(async (req, res) => {
  const success = await sendSimpleEmail(
    pickValue(req, "toEmail"),
    pickValue(req, "subject"),
    pickValue(req, "content"),
  );

  res.status(success ? 200 : 400).json({
    success,
    message: success
      ? "Email Ä‘Ã£ Ä‘Æ°á»£c gá»­i thÃ nh cÃ´ng!"
      : "KhÃ´ng thá»ƒ gá»­i email. Vui lÃ²ng kiá»ƒm tra API key.",
  });
});

const sendHtml = asyncHandler(async (req, res) => {
  const success = await sendHtmlEmail(
    pickValue(req, "toEmail"),
    pickValue(req, "toName"),
    pickValue(req, "subject"),
    pickValue(req, "htmlContent"),
  );

  res.status(success ? 200 : 400).json({
    success,
    message: success
      ? "Email HTML Ä‘Ã£ Ä‘Æ°á»£c gá»­i thÃ nh cÃ´ng!"
      : "KhÃ´ng thá»ƒ gá»­i email. Vui lÃ²ng kiá»ƒm tra API key.",
  });
});

const sendVerification = asyncHandler(async (req, res) => {
  const success = await sendVerificationEmail(
    pickValue(req, "toEmail"),
    pickValue(req, "verificationLink"),
  );

  res.status(success ? 200 : 400).json({
    success,
    message: success
      ? "Email xÃ¡c minh Ä‘Ã£ Ä‘Æ°á»£c gá»­i thÃ nh cÃ´ng!"
      : "KhÃ´ng thá»ƒ gá»­i email xÃ¡c minh.",
  });
});

const sendNotification = asyncHandler(async (req, res) => {
  const success = await sendNotificationEmail(
    pickValue(req, "toEmail"),
    pickValue(req, "title"),
    pickValue(req, "message"),
  );

  res.status(success ? 200 : 400).json({
    success,
    message: success
      ? "Email thÃ´ng bÃ¡o Ä‘Ã£ Ä‘Æ°á»£c gá»­i thÃ nh cÃ´ng!"
      : "KhÃ´ng thá»ƒ gá»­i email thÃ´ng bÃ¡o.",
  });
});

function health(_req, res) {
  res.json({
    status: "ok",
    message: "Email service is running",
  });
}

module.exports = {
  sendSimple,
  sendHtml,
  sendVerification,
  sendNotification,
  health,
};

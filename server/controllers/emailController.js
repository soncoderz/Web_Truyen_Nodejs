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

/**
 * Gửi email đơn giản với nội dung text
 * Hó trợ lấy thông tin từ request body hoặc query params
 * @param {Object} req - Express request object, chứa toEmail, subject, content
 * @param {Object} res - Express response object
 */
const sendSimple = asyncHandler(async (req, res) => {
  const success = await sendSimpleEmail(
    pickValue(req, "toEmail"),
    pickValue(req, "subject"),
    pickValue(req, "content"),
  );

  res.status(success ? 200 : 400).json({
    success,
    message: success
      ? "Email đã gửi thành công!"
      : "Không thể gửi email. Vui lòng kiểm tra API key.",
  });
});

/**
 * Gửi email HTML với nội dung định dạng
 * @param {Object} req - Express request object, chứa toEmail, toName, subject, htmlContent
 * @param {Object} res - Express response object
 */
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
      ? "Email HTML đã gửi thành công!"
      : "Không thể gửi email. Vui lòng kiểm tra API key.",
  });
});

/**
 * Gửi email xác minh với link
 * @param {Object} req - Express request object, chứa toEmail, verificationLink
 * @param {Object} res - Express response object
 */
const sendVerification = asyncHandler(async (req, res) => {
  const success = await sendVerificationEmail(
    pickValue(req, "toEmail"),
    pickValue(req, "verificationLink"),
  );

  res.status(success ? 200 : 400).json({
    success,
    message: success
      ? "Email xác minh đã gửi thành công!"
      : "Không thể gửi email xác minh.",
  });
});

/**
 * Gửi email thông báo với tiêu đề và nội dung
 * @param {Object} req - Express request object, chứa toEmail, title, message
 * @param {Object} res - Express response object
 */
const sendNotification = asyncHandler(async (req, res) => {
  const success = await sendNotificationEmail(
    pickValue(req, "toEmail"),
    pickValue(req, "title"),
    pickValue(req, "message"),
  );

  res.status(success ? 200 : 400).json({
    success,
    message: success
      ? "Email thông báo đã gửi thành công!"
      : "Không thể gửi email thông báo.",
  });
});

/**
 * Kiểm tra tạo thị dịch vụ email
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
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

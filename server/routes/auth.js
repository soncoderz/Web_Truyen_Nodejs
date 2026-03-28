const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { randomUUID } = require("crypto");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");
const env = require("../config/env");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const { hasText } = require("../utils/normalize");
const { getRoleRefs, resolveRoleNames } = require("../services/roleService");
const { serializeJwtResponse } = require("../services/hydrationService");
const {
  sendResetPasswordEmail,
} = require("../services/emailService");

const router = express.Router();
const googleClient = env.googleClientId
  ? new OAuth2Client(env.googleClientId)
  : null;

function signJwt(user, roles) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      roles,
      avatar: user.avatar || null,
    },
    env.jwtSecret,
    {
      expiresIn: Math.max(1, Math.floor(env.jwtExpirationMs / 1000)),
    },
  );
}

async function buildAuthPayload(userDocument) {
  const user = serializeDoc(userDocument);
  const roles = await resolveRoleNames(userDocument);
  const token = signJwt(user, roles);
  return serializeJwtResponse({ token, user, roles });
}

router.post(
  "/signin",
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (!user) {
      return res.status(401).json(buildMessage("Lỗi: Tên đăng nhập hoặc mật khẩu không đúng!"));
    }

    const validPassword = await bcrypt.compare(req.body.password || "", user.password || "");
    if (!validPassword) {
      return res.status(401).json(buildMessage("Lỗi: Tên đăng nhập hoặc mật khẩu không đúng!"));
    }

    res.json(await buildAuthPayload(user));
  }),
);

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const existingUsername = await User.exists({ username: req.body.username });
    if (existingUsername) {
      return res.status(400).json(buildMessage("Lỗi: Tên đăng nhập đã tồn tại!"));
    }

    const existingEmail = await User.exists({ email: req.body.email });
    if (existingEmail) {
      return res.status(400).json(buildMessage("Lỗi: Email đã được sử dụng!"));
    }

    const requestedRoles = Array.isArray(req.body.roles) ? req.body.roles : [];
    const roleNames =
      requestedRoles.length === 0
        ? ["ROLE_USER"]
        : requestedRoles.map((role) =>
            String(role).toLowerCase() === "admin" ? "ROLE_ADMIN" : "ROLE_USER",
          );

    const user = await User.create({
      username: req.body.username,
      email: req.body.email,
      password: await bcrypt.hash(String(req.body.password || ""), 10),
      provider: "local",
      roles: await getRoleRefs(Array.from(new Set(roleNames))),
    });

    res.json(buildMessage("Đăng ký tài khoản thành công!"));
  }),
);

router.post(
  "/google",
  asyncHandler(async (req, res) => {
    try {
      if (!googleClient || !env.googleClientId) {
        return res
          .status(400)
          .json(buildMessage("Lỗi: Đăng nhập Google thất bại! Thiếu Google client ID."));
      }

      const ticket = await googleClient.verifyIdToken({
        idToken: req.body.credential,
        audience: env.googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(400).json(buildMessage("Lỗi: Google token không hợp lệ!"));
      }

      const googleId = payload.sub;
      const email = payload.email;
      const pictureUrl = payload.picture || null;

      let user = await User.findOne({ googleId });
      if (!user) {
        user = await User.findOne({ email });
        if (user) {
          user.googleId = googleId;
          user.provider = "google";
          if (pictureUrl) {
            user.avatar = pictureUrl;
          }
          await user.save();
        } else {
          const baseUsername = String(email || "user").split("@")[0] || "user";
          let username = baseUsername;
          let counter = 1;

          while (await User.exists({ username })) {
            username = `${baseUsername}${counter}`;
            counter += 1;
          }

          user = await User.create({
            username,
            email,
            password: await bcrypt.hash(randomUUID(), 10),
            googleId,
            provider: "google",
            avatar: pictureUrl,
            roles: await getRoleRefs(["ROLE_USER"]),
          });
        }
      } else if (pictureUrl) {
        user.avatar = pictureUrl;
        await user.save();
      }

      return res.json(await buildAuthPayload(user));
    } catch (error) {
      return res
        .status(400)
        .json(buildMessage(`Lỗi: Đăng nhập Google thất bại! ${error.message}`));
    }
  }),
);

router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(400).json(buildMessage("Lỗi: Không tìm thấy email!"));
    }

    const token = randomUUID();
    user.resetToken = token;
    user.resetTokenExpiry = new Date(Date.now() + 3600 * 1000);
    await user.save();

    const sent = await sendResetPasswordEmail(user.email, token);
    if (!sent) {
      return res.status(500).json(buildMessage("Lỗi: Không thể gửi email."));
    }

    res.json(buildMessage("Đã gửi email đặt lại mật khẩu thành công."));
  }),
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ resetToken: req.body.token });
    if (!user) {
      return res.status(400).json(buildMessage("Lỗi: Token không hợp lệ!"));
    }

    if (user.resetTokenExpiry && user.resetTokenExpiry.getTime() < Date.now()) {
      return res.status(400).json(buildMessage("Lỗi: Token đã hết hạn!"));
    }

    user.password = await bcrypt.hash(String(req.body.newPassword || ""), 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json(buildMessage("Đặt lại mật khẩu thành công!"));
  }),
);

module.exports = router;

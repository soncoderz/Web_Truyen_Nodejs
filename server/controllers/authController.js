const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { randomUUID } = require("crypto");
const User = require("../models/user");
const env = require("../config/env");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const asyncHandler = require("../utils/asyncHandler");
const { getRoleRefs, resolveRoleNames } = require("../services/roleService");
const { serializeJwtResponse } = require("../services/hydrationService");
const { sendResetPasswordEmail } = require("../services/emailService");

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

const signIn = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (!user) {
    return res
      .status(401)
      .json(buildMessage("Lỗi: Ten dang nhap hoac mat khau khong dung!"));
  }

  const validPassword = await bcrypt.compare(
    req.body.password || "",
    user.password || "",
  );
  if (!validPassword) {
    return res
      .status(401)
      .json(buildMessage("Lỗi: Ten dang nhap hoac mat khau khong dung!"));
  }

  res.json(await buildAuthPayload(user));
});

const signUp = asyncHandler(async (req, res) => {
  const existingUsername = await User.exists({ username: req.body.username });
  if (existingUsername) {
    return res.status(400).json(buildMessage("Lỗi: Ten dang nhap da ton tai!"));
  }

  const existingEmail = await User.exists({ email: req.body.email });
  if (existingEmail) {
    return res.status(400).json(buildMessage("Lỗi: Email da duoc su dung!"));
  }

  const requestedRoles = Array.isArray(req.body.roles) ? req.body.roles : [];
  const roleNames =
    requestedRoles.length === 0
      ? ["ROLE_USER"]
      : requestedRoles.map((role) =>
          String(role).toLowerCase() === "admin" ? "ROLE_ADMIN" : "ROLE_USER",
        );

  await User.create({
    username: req.body.username,
    email: req.body.email,
    password: await bcrypt.hash(String(req.body.password || ""), 10),
    provider: "local",
    roles: await getRoleRefs(Array.from(new Set(roleNames))),
  });

  res.json(buildMessage("Dang ky tai khoan thành công!"));
});

const signInWithGoogle = asyncHandler(async (req, res) => {
  try {
    if (!googleClient || !env.googleClientId) {
      return res
        .status(400)
        .json(
          buildMessage(
            "Lỗi: Dang nhap Google that bai! Thieu Google client ID.",
          ),
        );
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: req.body.credential,
      audience: env.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json(buildMessage("Lỗi: Google token khong hop le!"));
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
      .json(buildMessage(`Lỗi: Dang nhap Google that bai! ${error.message}`));
  }
});

const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.status(400).json(buildMessage("Lỗi: Khong tim thay email!"));
  }

  const token = randomUUID();
  user.resetToken = token;
  user.resetTokenExpiry = new Date(Date.now() + 3600 * 1000);
  await user.save();

  const sent = await sendResetPasswordEmail(user.email, token);
  if (!sent) {
    return res.status(500).json(buildMessage("Lỗi: Khong the gui email."));
  }

  res.json(buildMessage("Da gui email dat lai mat khau thành công."));
});

const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ resetToken: req.body.token });
  if (!user) {
    return res.status(400).json(buildMessage("Lỗi: Token khong hop le!"));
  }

  if (user.resetTokenExpiry && user.resetTokenExpiry.getTime() < Date.now()) {
    return res.status(400).json(buildMessage("Lỗi: Token da het han!"));
  }

  user.password = await bcrypt.hash(String(req.body.newPassword || ""), 10);
  user.resetToken = null;
  user.resetTokenExpiry = null;
  await user.save();

  res.json(buildMessage("Dat lai mat khau thành công!"));
});

module.exports = {
  signIn,
  signUp,
  signInWithGoogle,
  forgotPassword,
  resetPassword,
};

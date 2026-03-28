const express = require("express");
const multer = require("multer");
const { Readable } = require("stream");
const { v2: cloudinary } = require("cloudinary");
const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRoles } = require("../middleware/auth");
const httpError = require("../utils/httpError");

const router = express.Router();

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 8,
  },
});

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        return reject(error);
      }
      return resolve(result);
    });

    Readable.from(buffer).pipe(stream);
  });
}

function ensureCloudinaryConfigured() {
  if (!env.isCloudinaryConfigured) {
    throw httpError(503, "Tải lên thất bại: Cloudinary chưa được cấu hình.");
  }
}

router.post(
  "/image",
  requireAuth,
  requireRoles("ROLE_ADMIN", "ROLE_USER"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    ensureCloudinaryConfigured();
    if (!req.file) {
      throw httpError(400, "Tải lên thất bại: Thiếu tệp.");
    }

    const result = await uploadBuffer(req.file.buffer, {
      folder: "truyen_online",
      resource_type: "image",
    });

    res.json({ url: result.secure_url });
  }),
);

router.post(
  "/images",
  requireAuth,
  requireRoles("ROLE_ADMIN", "ROLE_USER"),
  upload.array("files"),
  asyncHandler(async (req, res) => {
    ensureCloudinaryConfigured();
    if (!req.files || req.files.length === 0) {
      throw httpError(400, "Tải lên thất bại: Thiếu tệp.");
    }

    const urls = [];
    for (const file of req.files) {
      const result = await uploadBuffer(file.buffer, {
        folder: "truyen_online/chapters",
        resource_type: "image",
      });
      urls.push(result.secure_url);
    }

    res.json({ urls });
  }),
);

module.exports = router;

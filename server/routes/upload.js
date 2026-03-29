const express = require("express");
const multer = require("multer");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRoles } = require("../middleware/auth");
const httpError = require("../utils/httpError");
const {
  ensureCloudinaryConfigured,
  uploadBuffer,
} = require("../services/cloudinaryUploadService");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 8,
  },
});

router.post(
  "/image",
  requireAuth,
  requireRoles("ROLE_ADMIN", "ROLE_USER"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    ensureCloudinaryConfigured();
    if (!req.file) {
      throw httpError(400, "Tai len that bai: Thieu tep.");
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
      throw httpError(400, "Tai len that bai: Thieu tep.");
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

const express = require("express");
const multer = require("multer");
const uploadController = require("../controllers/uploadController");
const { requireAuth, requireRoles } = require("../middleware/auth");

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
  uploadController.uploadImage,
);

router.post(
  "/images",
  requireAuth,
  requireRoles("ROLE_ADMIN", "ROLE_USER"),
  upload.array("files"),
  uploadController.uploadImages,
);

module.exports = router;

const asyncHandler = require("../utils/asyncHandler");
const httpError = require("../utils/httpError");
const {
  ensureCloudinaryConfigured,
  uploadBuffer,
} = require("../services/cloudinaryUploadService");

const uploadImage = asyncHandler(async (req, res) => {
  ensureCloudinaryConfigured();
  if (!req.file) {
    throw httpError(400, "Tai len that bai: Thieu tep.");
  }

  const result = await uploadBuffer(req.file.buffer, {
    folder: "truyen_online",
    resource_type: "image",
  });

  res.json({ url: result.secure_url });
});

const uploadImages = asyncHandler(async (req, res) => {
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
});

module.exports = {
  uploadImage,
  uploadImages,
};

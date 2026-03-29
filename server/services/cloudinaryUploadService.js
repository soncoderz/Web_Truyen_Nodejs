const { Readable } = require("stream");
const { v2: cloudinary } = require("cloudinary");
const env = require("../config/env");
const httpError = require("../utils/httpError");

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

function ensureCloudinaryConfigured() {
  if (!env.isCloudinaryConfigured) {
    throw httpError(503, "Tai len that bai: Cloudinary chua duoc cau hinh.");
  }
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    Readable.from(buffer).pipe(stream);
  });
}

module.exports = {
  ensureCloudinaryConfigured,
  uploadBuffer,
};

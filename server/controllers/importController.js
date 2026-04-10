const asyncHandler = require("../utils/asyncHandler");
const {
  importRemoteMangaPages,
  scanRemoteMangaSource,
} = require("../services/mangaImportService");

/**
 * Quết và phân tích một trang ngỏn để lấy danh sách manga
 * Hó trợ cả cách thực Puppeteer và HTTP bình thường
 * @param {Object} req - Express request object, chứa url và usePuppeteer trong body
 * @param {Object} res - Express response object
 */
const scanSource = asyncHandler(async (req, res) => {
  const result = await scanRemoteMangaSource({
    url: req.body?.url,
    usePuppeteer: Boolean(req.body?.usePuppeteer),
  });

  res.json(result);
});

/**
 * Nhập các trang manga tữ URL ngỏn vào hệ thống
 * Tải xuống hình ảnh và lưu vào Cloudinary
 * @param {Object} req - Express request object, chứa sourceUrl và imageUrls trong body
 * @param {Object} res - Express response object
 */
const importMangaPages = asyncHandler(async (req, res) => {
  const result = await importRemoteMangaPages({
    sourceUrl: req.body?.sourceUrl,
    imageUrls: req.body?.imageUrls,
  });

  res.json(result);
});

module.exports = {
  scanSource,
  importMangaPages,
};

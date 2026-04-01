const asyncHandler = require("../utils/asyncHandler");
const {
  importRemoteMangaPages,
  scanRemoteMangaSource,
} = require("../services/mangaImportService");

const scanSource = asyncHandler(async (req, res) => {
  const result = await scanRemoteMangaSource({
    url: req.body?.url,
    usePuppeteer: Boolean(req.body?.usePuppeteer),
  });

  res.json(result);
});

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

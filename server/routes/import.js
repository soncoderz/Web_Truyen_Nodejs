const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRoles } = require("../middleware/auth");
const {
  importRemoteMangaPages,
  scanRemoteMangaSource,
} = require("../services/mangaImportService");

const router = express.Router();

router.post(
  "/scan",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await scanRemoteMangaSource({
      url: req.body?.url,
      usePuppeteer: Boolean(req.body?.usePuppeteer),
    });

    res.json(result);
  }),
);

router.post(
  "/manga-pages",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await importRemoteMangaPages({
      sourceUrl: req.body?.sourceUrl,
      imageUrls: req.body?.imageUrls,
    });

    res.json(result);
  }),
);

module.exports = router;

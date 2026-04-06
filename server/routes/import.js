const express = require("express");
const importController = require("../controllers/importController");
const { requireAuth, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.post("/scan", requireAuth, requireRoles("ROLE_ADMIN"), importController.scanSource);
router.post(
  "/manga-pages",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  importController.importMangaPages,
);

module.exports = router;

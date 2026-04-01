const express = require("express");
const bookmarksController = require("../controllers/bookmarksController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, bookmarksController.listBookmarks);
router.post("/", requireAuth, bookmarksController.upsertBookmark);
router.delete("/:id", requireAuth, bookmarksController.deleteBookmark);

module.exports = router;

const express = require("express");
const readingHistoryController = require("../controllers/readingHistoryController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, readingHistoryController.listReadingHistory);
router.get("/story/:storyId", requireAuth, readingHistoryController.getStoryReadingHistory);
router.post("/", requireAuth, readingHistoryController.upsertReadingHistory);
router.delete("/:id", requireAuth, readingHistoryController.deleteReadingHistory);

module.exports = router;

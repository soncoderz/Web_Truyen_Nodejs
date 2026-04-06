const express = require("express");
const ratingsController = require("../controllers/ratingsController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/", requireAuth, ratingsController.rateStory);
router.get("/story/:storyId", ratingsController.getStoryRatingSummary);
router.get("/story/:storyId/user", requireAuth, ratingsController.getUserStoryRating);

module.exports = router;

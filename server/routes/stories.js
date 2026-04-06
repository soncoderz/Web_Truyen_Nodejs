const express = require("express");
const storiesController = require("../controllers/storiesController");
const { requireAuth, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/", storiesController.listStories);
router.get("/manage", requireAuth, requireRoles("ROLE_ADMIN"), storiesController.listManageStories);
router.get("/mine", requireAuth, storiesController.listMyStories);
router.get("/review", requireAuth, requireRoles("ROLE_ADMIN"), storiesController.listReviewStories);
router.get("/trending", storiesController.listTrendingStories);
router.get("/new-releases", storiesController.listNewReleaseStories);
router.get("/licensed", storiesController.listLicensedStories);
router.get("/hot", storiesController.listHotStories);
router.get("/recommendations", storiesController.listRecommendations);
router.get("/followed", requireAuth, storiesController.listFollowedStories);
router.get("/search", storiesController.searchStories);
router.post("/", requireAuth, storiesController.createStory);
router.put("/:id", requireAuth, storiesController.updateStory);
router.put(
  "/:id/approval",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  storiesController.updateStoryApproval,
);
router.delete("/:id", requireAuth, storiesController.deleteStory);
router.put("/:id/views", storiesController.incrementStoryViews);
router.post("/:id/follow", requireAuth, storiesController.toggleFollowStory);
router.get("/:id/is-following", requireAuth, storiesController.getIsFollowingStory);
router.get("/:id/related", storiesController.listRelatedStories);
router.get("/:id/ai-recommendations", storiesController.listStoryAiRecommendations);
router.get("/:id", storiesController.getStoryById);

module.exports = router;

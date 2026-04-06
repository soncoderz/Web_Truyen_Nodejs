const express = require("express");
const chaptersController = require("../controllers/chaptersController");
const { requireAuth, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/story/:storyId/manage", requireAuth, chaptersController.listManageStoryChapters);
router.get("/story/:storyId", chaptersController.listStoryChapters);
router.get("/mine", requireAuth, chaptersController.listMyChapters);
router.get("/review", requireAuth, requireRoles("ROLE_ADMIN"), chaptersController.listReviewChapters);
router.get("/:id", chaptersController.getChapterById);
router.post("/", requireAuth, chaptersController.createChapter);
router.put("/:id", requireAuth, chaptersController.updateChapter);
router.post(
  "/:id/summary",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  chaptersController.regenerateChapterSummary,
);
router.put(
  "/:id/approval",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  chaptersController.updateChapterApproval,
);
router.delete("/:id", requireAuth, chaptersController.deleteChapter);

module.exports = router;

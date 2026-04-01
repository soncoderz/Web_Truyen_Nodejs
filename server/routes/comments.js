const express = require("express");
const commentsController = require("../controllers/commentsController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/story/:storyId", commentsController.listStoryComments);
router.get("/chapter/:chapterId/thread", commentsController.listChapterThreadComments);
router.get("/chapter/:chapterId", commentsController.listChapterComments);
router.get(
  "/chapter/:chapterId/page/:pageIndex",
  commentsController.listChapterPageComments,
);
router.post("/", requireAuth, commentsController.createComment);
router.delete("/:id", requireAuth, commentsController.deleteComment);

module.exports = router;

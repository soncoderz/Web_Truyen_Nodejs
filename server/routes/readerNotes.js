const express = require("express");
const readerNotesController = require("../controllers/readerNotesController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get(
  "/story/:storyId/chapter/:chapterId",
  requireAuth,
  readerNotesController.listReaderNotes,
);
router.post("/", requireAuth, readerNotesController.upsertReaderNote);
router.delete(
  "/story/:storyId/chapter/:chapterId",
  requireAuth,
  readerNotesController.deleteReaderNote,
);

module.exports = router;

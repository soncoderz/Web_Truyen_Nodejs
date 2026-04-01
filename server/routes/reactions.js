const express = require("express");
const reactionsController = require("../controllers/reactionsController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/summary", reactionsController.getSummary);
router.post("/batch-summary", reactionsController.getBatchSummary);
router.put("/", requireAuth, reactionsController.setReaction);

module.exports = router;

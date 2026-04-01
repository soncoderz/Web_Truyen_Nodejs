const express = require("express");
const systemController = require("../controllers/systemController");

const router = express.Router();

router.get("/health", systemController.health);

module.exports = router;

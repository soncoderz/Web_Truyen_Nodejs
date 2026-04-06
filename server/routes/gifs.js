const express = require("express");
const gifsController = require("../controllers/gifsController");

const router = express.Router();

router.get("/search", gifsController.searchGifs);
router.get("/trending", gifsController.trendingGifs);
router.get("/proxy", gifsController.proxyGif);

module.exports = router;

const express = require("express");
const adminController = require("../controllers/adminController");
const { requireAuth, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRoles("ROLE_ADMIN"));

router.get("/stats", adminController.getStats);
router.get("/stats/trends", adminController.getStatsTrends);
router.get("/stats/hot", adminController.getStatsHot);
router.get("/stats/distribution", adminController.getDistribution);
router.get("/comments", adminController.listComments);

module.exports = router;

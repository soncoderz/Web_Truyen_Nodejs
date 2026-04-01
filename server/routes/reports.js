const express = require("express");
const reportsController = require("../controllers/reportsController");
const { requireAuth, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.post("/", requireAuth, reportsController.createReport);
router.get("/", requireAuth, requireRoles("ROLE_ADMIN"), reportsController.listReports);
router.put(
  "/:id/status",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  reportsController.updateReportStatus,
);

module.exports = router;

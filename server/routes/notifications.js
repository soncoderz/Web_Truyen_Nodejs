const express = require("express");
const notificationsController = require("../controllers/notificationsController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, notificationsController.listNotifications);
router.get("/unread-count", requireAuth, notificationsController.getUnreadCount);
router.put("/:id/read", requireAuth, notificationsController.markRead);
router.put("/read-all", requireAuth, notificationsController.markAllRead);

module.exports = router;

const express = require("express");
const router = express.Router();

// Test endpoint để kiểm tra server
router.get("/socket-status", (req, res) => {
  res.json({
    status: "ok",
    message: "Socket.IO server is ready",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

const express = require("express");
const usersController = require("../controllers/usersController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/me/profile", requireAuth, usersController.getMyProfileSettings);
router.put("/me/profile", requireAuth, usersController.updateMyProfile);
router.get("/:id/public", usersController.getPublicUserProfile);

module.exports = router;

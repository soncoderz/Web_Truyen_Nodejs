const express = require("express");
const authorsController = require("../controllers/authorsController");
const { requireAuth, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/", authorsController.listAuthors);
router.get("/:id", authorsController.getAuthorById);
router.post("/", requireAuth, requireRoles("ROLE_ADMIN"), authorsController.createAuthor);
router.put("/:id", requireAuth, requireRoles("ROLE_ADMIN"), authorsController.updateAuthor);
router.delete("/:id", requireAuth, requireRoles("ROLE_ADMIN"), authorsController.deleteAuthor);

module.exports = router;

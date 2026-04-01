const express = require("express");
const categoriesController = require("../controllers/categoriesController");
const { requireAuth, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/", categoriesController.listCategories);
router.get("/:id", categoriesController.getCategoryById);
router.post("/", requireAuth, requireRoles("ROLE_ADMIN"), categoriesController.createCategory);
router.put("/:id", requireAuth, requireRoles("ROLE_ADMIN"), categoriesController.updateCategory);
router.delete("/:id", requireAuth, requireRoles("ROLE_ADMIN"), categoriesController.deleteCategory);

module.exports = router;

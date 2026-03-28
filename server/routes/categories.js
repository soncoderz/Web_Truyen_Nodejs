const express = require("express");
const Category = require("../models/category");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const categories = await Category.find({}).lean();
    res.json(categories.map(serializeDoc));
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id).lean();
    if (!category) {
      throw httpError(400, "Lỗi: Không tìm thấy thể loại!");
    }

    res.json(serializeDoc(category));
  }),
);

router.post(
  "/",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const category = await Category.create({
      name: req.body.name,
      description: req.body.description,
    });

    res.json(serializeDoc(category));
  }),
);

router.put(
  "/:id",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) {
      throw httpError(400, "Lỗi: Không tìm thấy thể loại!");
    }

    category.name = req.body.name;
    category.description = req.body.description;
    await category.save();

    res.json(serializeDoc(category));
  }),
);

router.delete(
  "/:id",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) {
      throw httpError(400, "Lỗi: Không tìm thấy thể loại!");
    }

    await category.deleteOne();
    res.json(buildMessage("Đã xóa thể loại thành công!"));
  }),
);

module.exports = router;

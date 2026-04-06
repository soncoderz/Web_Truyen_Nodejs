const Category = require("../models/category");
const asyncHandler = require("../utils/asyncHandler");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");

const listCategories = asyncHandler(async (_req, res) => {
  const categories = await Category.find({}).lean();
  res.json(categories.map(serializeDoc));
});

const getCategoryById = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id).lean();
  if (!category) {
    throw httpError(400, "Lỗi: Không tìm thấy thể loại!");
  }

  res.json(serializeDoc(category));
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create({
    name: req.body.name,
    description: req.body.description,
  });

  res.json(serializeDoc(category));
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    throw httpError(400, "Lỗi: Không tìm thấy thể loại!");
  }

  category.name = req.body.name;
  category.description = req.body.description;
  await category.save();

  res.json(serializeDoc(category));
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    throw httpError(400, "Lỗi: Không tìm thấy thể loại!");
  }

  await category.deleteOne();
  res.json(buildMessage("xóa danh mục thành công!"));
});

module.exports = {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};

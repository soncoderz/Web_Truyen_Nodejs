const Category = require("../models/category");
const asyncHandler = require("../utils/asyncHandler");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");

/**
 * Lấy danh sách tất cả các thể loại
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listCategories = asyncHandler(async (_req, res) => {
  const categories = await Category.find({}).lean();
  res.json(categories.map(serializeDoc));
});

/**
 * Lấy thông tin chi tiết của một thể loại theo ID
 * @param {Object} req - Express request object, chứa category ID trong params
 * @param {Object} res - Express response object
 */
const getCategoryById = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id).lean();
  if (!category) {
    throw httpError(400, "Lỗi: Không tìm thấy thể loại!");
  }

  res.json(serializeDoc(category));
});

/**
 * Tạo một thể loại mới
 * @param {Object} req - Express request object, chứa name và description trong body
 * @param {Object} res - Express response object
 */
const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create({
    name: req.body.name,
    description: req.body.description,
  });

  res.json(serializeDoc(category));
});

/**
 * Cập nhật thông tin của một thể loại
 * @param {Object} req - Express request object, chứa category ID trong params và name, description trong body
 * @param {Object} res - Express response object
 */
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

/**
 * Xóa một thể loại
 * @param {Object} req - Express request object, chứa category ID trong params
 * @param {Object} res - Express response object
 */
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

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
    throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y thá»ƒ loáº¡i!");
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
    throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y thá»ƒ loáº¡i!");
  }

  category.name = req.body.name;
  category.description = req.body.description;
  await category.save();

  res.json(serializeDoc(category));
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y thá»ƒ loáº¡i!");
  }

  await category.deleteOne();
  res.json(buildMessage("ÄÃ£ xÃ³a thá»ƒ loáº¡i thÃ nh cÃ´ng!"));
});

module.exports = {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};

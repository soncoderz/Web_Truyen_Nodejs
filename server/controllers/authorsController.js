const Author = require("../models/author");
const asyncHandler = require("../utils/asyncHandler");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");

/**
 * Lấy danh sách tất cả các tác giả
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const listAuthors = asyncHandler(async (_req, res) => {
  const authors = await Author.find({}).lean();
  res.json(authors.map(serializeDoc));
});

/**
 * Lấy thông tin chi tiết của một tác giả theo ID
 * @param {Object} req - Express request object, chứa author ID trong params
 * @param {Object} res - Express response object
 */
const getAuthorById = asyncHandler(async (req, res) => {
  const author = await Author.findById(req.params.id).lean();
  if (!author) {
    throw httpError(400, "Lỗi: Không tìm thấy tác giả!");
  }

  res.json(serializeDoc(author));
});

/**
 * Tạo một tác giả mới
 * @param {Object} req - Express request object, chứa name và description trong body
 * @param {Object} res - Express response object
 */
const createAuthor = asyncHandler(async (req, res) => {
  const author = await Author.create({
    name: req.body.name,
    description: req.body.description,
  });

  res.json(serializeDoc(author));
});

/**
 * Cập nhật các thông tin của một tác giả
 * @param {Object} req - Express request object, chứa author ID trong params và name, description trong body
 * @param {Object} res - Express response object
 */
const updateAuthor = asyncHandler(async (req, res) => {
  const author = await Author.findById(req.params.id);
  if (!author) {
    throw httpError(400, "Lỗi: Không tìm thấy tác giả!");
  }

  author.name = req.body.name;
  author.description = req.body.description;
  await author.save();

  res.json(serializeDoc(author));
});

/**
 * Xóa một tác giả
 * @param {Object} req - Express request object, chứa author ID trong params
 * @param {Object} res - Express response object
 */
const deleteAuthor = asyncHandler(async (req, res) => {
  const author = await Author.findById(req.params.id);
  if (!author) {
    throw httpError(400, "Lỗi: Không tìm thấy tác giả!");
  }

  await author.deleteOne();
  res.json(buildMessage("Đã xóa tác giả thành công!"));
});

module.exports = {
  listAuthors,
  getAuthorById,
  createAuthor,
  updateAuthor,
  deleteAuthor,
};

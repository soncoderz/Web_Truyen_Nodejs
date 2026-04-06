const Author = require("../models/author");
const asyncHandler = require("../utils/asyncHandler");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");

const listAuthors = asyncHandler(async (_req, res) => {
  const authors = await Author.find({}).lean();
  res.json(authors.map(serializeDoc));
});

const getAuthorById = asyncHandler(async (req, res) => {
  const author = await Author.findById(req.params.id).lean();
  if (!author) {
    throw httpError(400, "Lỗi: Không tìm thấy tác giả!");
  }

  res.json(serializeDoc(author));
});

const createAuthor = asyncHandler(async (req, res) => {
  const author = await Author.create({
    name: req.body.name,
    description: req.body.description,
  });

  res.json(serializeDoc(author));
});

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

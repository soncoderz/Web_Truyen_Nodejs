const { Schema, model } = require("mongoose");

const authorSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
  },
  {
    collection: "authors",
  },
);

module.exports = model("Author", authorSchema);

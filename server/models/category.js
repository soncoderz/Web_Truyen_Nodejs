const { Schema, model } = require("mongoose");

const categorySchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
  },
  {
    collection: "categories",
  },
);

module.exports = model("Category", categorySchema);

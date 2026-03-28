const { Schema, model } = require("mongoose");

const roleSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      enum: ["ROLE_USER", "ROLE_ADMIN"],
      unique: true,
    },
  },
  {
    collection: "roles",
  },
);

module.exports = model("Role", roleSchema);

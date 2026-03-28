const User = require("../models/user");
const httpError = require("./httpError");

async function getCurrentUserDocument(req) {
  if (!req.user?.id) {
    throw httpError(401, "Error: Unauthorized");
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    throw httpError(401, "Error: Unauthorized");
  }

  return user;
}

module.exports = {
  getCurrentUserDocument,
};

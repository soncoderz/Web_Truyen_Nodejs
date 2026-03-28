const mongoose = require("mongoose");
const env = require("../config/env");

async function connectDatabase() {
  if (!env.mongoUri) {
    throw new Error("Missing MongoDB connection string.");
  }

  await mongoose.connect(env.mongoUri);
  return mongoose.connection;
}

module.exports = {
  connectDatabase,
  mongoose,
};

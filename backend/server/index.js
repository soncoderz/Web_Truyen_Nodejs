const createApp = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./db/mongoose");
const { ensureRoles } = require("./services/roleService");

async function startServer() {
  await connectDatabase();
  await ensureRoles();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Node backend listening on port ${env.port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Node backend.", error);
  process.exit(1);
});

const http = require("http");
const createApp = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/db/mongoose");
const { initializeRealtime } = require("./services/realtime");
const { ensureRoles } = require("./services/roleService");

async function startServer() {
  await connectDatabase();
  await ensureRoles();

  const app = createApp();
  const server = http.createServer(app);
  initializeRealtime(server);

  server.listen(env.port, () => {
    console.log(`Node backend listening on port ${env.port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Node backend.", error);
  process.exit(1);
});

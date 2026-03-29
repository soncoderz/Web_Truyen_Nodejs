const http = require("http");
const {
  backendLogPath,
  installConsoleCapture,
  installProcessLogging,
  logError,
  logInfo,
} = require("./utils/logger");
const createApp = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/db/mongoose");
const { initializeRealtime } = require("./services/realtime");
const { ensureRoles } = require("./services/roleService");

installConsoleCapture();
installProcessLogging();

async function startServer() {
  await connectDatabase();
  await ensureRoles();

  const app = createApp();
  const server = http.createServer(app);
  initializeRealtime(server);

  server.on("error", (error) => {
    console.error("Node backend failed to bind port.", error);
    logError("Node backend failed to bind port.", error);
    process.exit(1);
  });

  server.listen(env.port, () => {
    console.info(`Node backend listening on port ${env.port}.`);
    console.info(`Backend log file: ${backendLogPath}`);
    logInfo(`Node backend listening on port ${env.port}.`);
    logInfo(`Backend log file: ${backendLogPath}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Node backend.", error);
  logError("Failed to start Node backend.", error);
  process.exit(1);
});

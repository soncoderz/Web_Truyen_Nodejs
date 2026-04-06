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

  // Khởi tạo Socket.IO
  logInfo("Initializing Socket.IO server...");
  initializeRealtime(server);
  logInfo("Socket.IO server initialized successfully");

  server.listen(env.port, () => {
    logInfo(`Node backend listening on port ${env.port}.`);
    logInfo(`Backend log file: ${backendLogPath}`);
    logInfo(`Socket.IO ready for connections`);
  });
}

startServer().catch((error) => {
  logError("Failed to start Node backend.", error);
  process.exit(1);
});

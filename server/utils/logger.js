const fs = require("fs");
const path = require("path");
const util = require("util");

const logsDirectoryPath = path.join(__dirname, "..", "logs");
const backendLogPath = path.join(logsDirectoryPath, "backend.log");

let logStream = null;
let consoleCaptureInstalled = false;
let processLoggingInstalled = false;

function ensureLogStream() {
  if (logStream) {
    return logStream;
  }

  fs.mkdirSync(logsDirectoryPath, { recursive: true });

  if (!fs.existsSync(backendLogPath)) {
    fs.writeFileSync(backendLogPath, "", "utf8");
  }

  logStream = fs.createWriteStream(backendLogPath, {
    flags: "a",
    encoding: "utf8",
  });

  return logStream;
}

function toTimestamp() {
  return new Date().toISOString();
}

function serializeLogArgument(argument) {
  if (argument instanceof Error) {
    return argument.stack || `${argument.name}: ${argument.message}`;
  }

  if (typeof argument === "string") {
    return argument;
  }

  return util.inspect(argument, {
    depth: 6,
    colors: false,
    maxArrayLength: 100,
    breakLength: 120,
  });
}

function writeLogLine(level, ...argumentsList) {
  try {
    const stream = ensureLogStream();
    const message = argumentsList.map(serializeLogArgument).join(" ");
    stream.write(`[${toTimestamp()}] [${level}] ${message}\n`);
  } catch (_error) {
    // Avoid recursive logging failures.
  }
}

function logInfo(...argumentsList) {
  writeLogLine("INFO", ...argumentsList);
}

function logWarn(...argumentsList) {
  writeLogLine("WARN", ...argumentsList);
}

function logError(...argumentsList) {
  writeLogLine("ERROR", ...argumentsList);
}

function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    logInfo(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms ip=${req.ip || req.socket?.remoteAddress || "-"}`,
    );
  });

  next();
}

function installConsoleCapture() {
  if (consoleCaptureInstalled) {
    return;
  }

  consoleCaptureInstalled = true;

  [
    ["log", "INFO"],
    ["info", "INFO"],
    ["warn", "WARN"],
    ["error", "ERROR"],
  ].forEach(([methodName, level]) => {
    const originalMethod = console[methodName].bind(console);

    console[methodName] = (...argumentsList) => {
      originalMethod(...argumentsList);
      writeLogLine(level, ...argumentsList);
    };
  });
}

function installProcessLogging() {
  if (processLoggingInstalled) {
    return;
  }

  processLoggingInstalled = true;

  process.on("unhandledRejection", (reason) => {
    logError("Unhandled promise rejection.", reason);
  });

  process.on("uncaughtException", (error) => {
    logError("Uncaught exception.", error);
    setTimeout(() => process.exit(1), 50);
  });
}

module.exports = {
  backendLogPath,
  installConsoleCapture,
  installProcessLogging,
  logError,
  logInfo,
  logWarn,
  requestLogger,
};

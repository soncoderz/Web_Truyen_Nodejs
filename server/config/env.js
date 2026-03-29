const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const backendRoot = path.resolve(__dirname, "../..");
const envCandidates = [
  path.join(backendRoot, ".env"),
  path.join(backendRoot, "server", ".env"),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

function parseProperties(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

const legacyProperties = parseProperties(
  path.join(backendRoot, "src", "main", "resources", "application.properties"),
);

function pickValue(envKey, propertyKey, fallback = "") {
  const envValue = process.env[envKey];
  if (envValue !== undefined && envValue !== "") {
    return envValue;
  }

  const propertyEnvValue = process.env[propertyKey];
  if (propertyEnvValue !== undefined && propertyEnvValue !== "") {
    return propertyEnvValue;
  }

  const propertyValue = legacyProperties[propertyKey];
  if (propertyValue !== undefined && propertyValue !== "") {
    return propertyValue;
  }

  return fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim().toLowerCase() === "true";
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const port = parseInteger(pickValue("PORT", "server.port", "8080"), 8080);

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  mongoUri: pickValue("MONGODB_URI", "spring.data.mongodb.uri"),
  jwtSecret: pickValue(
    "JWT_SECRET",
    "app.jwtSecret",
    "change-me-super-secret-jwt-key",
  ),
  jwtExpirationMs: parseInteger(
    pickValue("JWT_EXPIRATION_MS", "app.jwtExpirationMs", "86400000"),
    86400000,
  ),
  frontendUrl: pickValue(
    "APP_FRONTEND_URL",
    "app.frontendUrl",
    "http://localhost:5173",
  ),
  backendUrl: pickValue(
    "APP_BACKEND_URL",
    "app.backendUrl",
    `http://localhost:${port}`,
  ),
  appSeedEnabled: parseBoolean(
    pickValue("APP_SEED_ENABLED", "app.seed.enabled", "false"),
    false,
  ),
  corsAllowedOriginPatterns: pickValue(
    "CORS_ALLOWED_ORIGIN_PATTERNS",
    "app.cors.allowed-origin-patterns",
    "http://localhost:5173,http://localhost:3000,https://web-tuyen-online.vercel.app,https://web-tuyen-online-*.vercel.app",
  ),
  sendgridApiKey: pickValue("SENDGRID_API_KEY", "sendgrid.api.key"),
  sendgridFromEmail: pickValue("SENDGRID_FROM_EMAIL", "sendgrid.from.email"),
  sendgridFromName: pickValue(
    "SENDGRID_FROM_NAME",
    "sendgrid.from.name",
    "Web Tuyen Online",
  ),
  cloudinaryCloudName: pickValue(
    "CLOUDINARY_CLOUD_NAME",
    "cloudinary.cloud_name",
  ),
  cloudinaryApiKey: pickValue("CLOUDINARY_API_KEY", "cloudinary.api_key"),
  cloudinaryApiSecret: pickValue(
    "CLOUDINARY_API_SECRET",
    "cloudinary.api_secret",
  ),
  googleClientId: pickValue("GOOGLE_CLIENT_ID", "google.client.id"),
  googleClientSecret: pickValue(
    "GOOGLE_CLIENT_SECRET",
    "google.client.secret",
  ),
  giphyApiKey: pickValue("GIPHY_API_KEY", "giphy.api.key"),
  momoEndpoint: pickValue(
    "MOMO_ENDPOINT",
    "momo.endpoint",
    "https://test-payment.momo.vn/v2/gateway/api/create",
  ),
  momoPartnerCode: pickValue("MOMO_PARTNER_CODE", "momo.partnerCode"),
  momoAccessKey: pickValue("MOMO_ACCESS_KEY", "momo.accessKey"),
  momoSecretKey: pickValue("MOMO_SECRET_KEY", "momo.secretKey"),
  momoStoreId: pickValue("MOMO_STORE_ID", "momo.storeId"),
  momoPartnerName: pickValue(
    "MOMO_PARTNER_NAME",
    "momo.partnerName",
    "Web Tuyen Online",
  ),
};

env.corsOriginPatterns = env.corsAllowedOriginPatterns
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

env.isSendGridConfigured = Boolean(
  env.sendgridApiKey && env.sendgridFromEmail,
);
env.isCloudinaryConfigured = Boolean(
  env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret,
);
env.isMomoConfigured = Boolean(
  env.momoEndpoint &&
    env.momoPartnerCode &&
    env.momoAccessKey &&
    env.momoSecretKey,
);

module.exports = env;

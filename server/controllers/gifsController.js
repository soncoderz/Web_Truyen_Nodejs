const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const httpError = require("../utils/httpError");

const ALLOWED_HOSTS = new Set([
  "media.giphy.com",
  "media1.giphy.com",
  "media2.giphy.com",
  "media3.giphy.com",
  "media4.giphy.com",
  "i.giphy.com",
]);

const MAX_LIMIT = 18;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const TRENDING_CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map();

function clampInteger(value, fallback, min = 1, max = MAX_LIMIT) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeQuery(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeRating(value) {
  const normalized = String(value ?? "g").trim().toLowerCase();

  if (["g", "pg", "pg-13"].includes(normalized)) {
    return normalized;
  }

  return "g";
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pickFirstObject(source, keys) {
  for (const key of keys) {
    const candidate = source?.[key];
    if (candidate && typeof candidate === "object") {
      return candidate;
    }
  }

  return null;
}

function pickFirstValue(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function normalizeGif(item) {
  const images = item?.images || {};
  const animatedVariant = pickFirstObject(images, [
    "fixed_width",
    "fixed_height",
    "downsized",
    "original",
  ]);
  const previewVariant = pickFirstObject(images, [
    "preview_webp",
    "fixed_width_small",
    "fixed_height_small",
    "fixed_width",
  ]);
  const stillVariant = pickFirstObject(images, [
    "fixed_width_still",
    "fixed_height_still",
    "downsized_still",
  ]);

  const url = pickFirstValue([animatedVariant?.url, animatedVariant?.webp]);

  if (!url) {
    return null;
  }

  const previewUrl = pickFirstValue([
    previewVariant?.webp,
    previewVariant?.url,
    stillVariant?.url,
    url,
  ]);

  return {
    id: String(item?.id || ""),
    title: String(item?.title || ""),
    url,
    size:
      parsePositiveInteger(animatedVariant?.size) ||
      parsePositiveInteger(animatedVariant?.webp_size),
    width: parsePositiveInteger(animatedVariant?.width),
    height: parsePositiveInteger(animatedVariant?.height),
    previewUrl,
    previewWidth:
      parsePositiveInteger(previewVariant?.width) ||
      parsePositiveInteger(animatedVariant?.width),
    previewHeight:
      parsePositiveInteger(previewVariant?.height) ||
      parsePositiveInteger(animatedVariant?.height),
    stillUrl: pickFirstValue([stillVariant?.url, previewUrl, url]),
  };
}

function getCachedPayload(key) {
  const cached = responseCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }

  return cached.payload;
}

function setCachedPayload(key, payload, ttlMs) {
  responseCache.set(key, {
    payload,
    expiresAt: Date.now() + ttlMs,
  });

  if (responseCache.size > 80) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) {
      responseCache.delete(oldestKey);
    }
  }

  return payload;
}

async function fetchGiphyFeed(url, cacheKey, ttlMs) {
  const cachedPayload = getCachedPayload(cacheKey);
  if (cachedPayload) {
    return cachedPayload;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw httpError(502, `GIPHY request failed with status ${response.status}`);
  }

  const data = await response.json();
  const payload = {
    data: Array.isArray(data?.data)
      ? data.data.map(normalizeGif).filter(Boolean)
      : [],
    pagination: data?.pagination || null,
    meta: data?.meta || null,
  };

  return setCachedPayload(cacheKey, payload, ttlMs);
}

const searchGifs = asyncHandler(async (req, res) => {
  if (!env.giphyApiKey) {
    throw httpError(503, "GIPHY API key missing");
  }

  const q = normalizeQuery(req.query.q);
  if (q.startsWith("http")) {
    throw httpError(400, "Search query must be plain text");
  }

  const limit = clampInteger(req.query.limit, 12);
  const rating = normalizeRating(req.query.rating);
  const url = new URL("https://api.giphy.com/v1/gifs/search");
  url.searchParams.set("api_key", env.giphyApiKey);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("rating", rating);

  res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
  res.json(
    await fetchGiphyFeed(
      url,
      `search:${rating}:${limit}:${q.toLowerCase()}`,
      SEARCH_CACHE_TTL_MS,
    ),
  );
});

const trendingGifs = asyncHandler(async (req, res) => {
  if (!env.giphyApiKey) {
    throw httpError(503, "GIPHY API key missing");
  }

  const limit = clampInteger(req.query.limit, 12);
  const rating = normalizeRating(req.query.rating);
  const url = new URL("https://api.giphy.com/v1/gifs/trending");
  url.searchParams.set("api_key", env.giphyApiKey);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("rating", rating);

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json(
    await fetchGiphyFeed(
      url,
      `trending:${rating}:${limit}`,
      TRENDING_CACHE_TTL_MS,
    ),
  );
});

const proxyGif = asyncHandler(async (req, res) => {
  if (!req.query.url) {
    throw httpError(400, "Missing URL");
  }

  const decodedUrl = decodeURIComponent(String(req.query.url));
  const target = new URL(decodedUrl);
  if (!ALLOWED_HOSTS.has(target.host.toLowerCase())) {
    throw httpError(403, "Host not allowed");
  }

  const response = await fetch(target);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
  res.status(response.status).send(Buffer.from(arrayBuffer));
});

module.exports = {
  searchGifs,
  trendingGifs,
  proxyGif,
};

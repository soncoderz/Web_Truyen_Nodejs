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
// Danh sach domain duoc phep tu GIPHY
// Dung de whitelist cac URL GIF tu GIPHY API (tranh xss, tim kiem tu source khac)

const MAX_LIMIT = 18;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const TRENDING_CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map();

function clampInteger(value, fallback, min = 1, max = MAX_LIMIT) {
  // 1. Parse gia tri thanh integer (base 10)
  const parsed = Number.parseInt(String(value ?? ""), 10);

  // 2. Neu khong phai so hop le - tra ve fallback
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  // 3. Gioi han trong range [min, max] - Math.max(min, value) sau Math.min(max, ...)
  return Math.min(max, Math.max(min, parsed));
  // Ket qua: max neu > max, min neu < min, else gia tri goc
}

function normalizeQuery(value) {
  // 1. Stringify gia tri (hoac chuoi rong neu null/undefined)
  // 2. Thay the toan bo khoang trang lien tiep (\s+) bang 1 khoang trang
  // 3. Trim khoang trang thua o dau va cuoi
  // 4. Cat du toi 80 ky tu (tranh query qua dai)
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeRating(value) {
  // 1. Stringify, trim, va convert thanh lowercase
  const normalized = String(value ?? "g").trim().toLowerCase();

  // 2. Kiem tra co phai la rating hop le khong (GIPHY 3 rating: g, pg, pg-13)
  // 3. Neu khong - mac dinh ve \"g\" (General Audiences)
  if (["g", "pg", "pg-13"].includes(normalized)) {
    return normalized;
  }

  return "g";  // Mac dinh an toan nhat
}

function parsePositiveInteger(value) {
  // 1. Parse gia tri thanh integer (base 10)
  const parsed = Number.parseInt(String(value ?? ""), 10);
  // 2. Kiem tra: phai la so hop le (isFinite) va lon hon 0
  // 3. Neu dung - tra ve so, neu sai - tra ve null
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pickFirstObject(source, keys) {
  // Loop qua danh sach keys va tra ve object dau tien hop le
  for (const key of keys) {
    // 1. Lay property tu source[key]
    const candidate = source?.[key];
    // 2. Kiem tra: candidate la object va khong null/undefined
    if (candidate && typeof candidate === "object") {
      return candidate;  // Return object dau tien tim thay
    }
  }

  // 3. Neu khong tim thay object nao - tra ve null
  return null;
}

function pickFirstValue(values) {
  // Loop qua danh sach values va tra ve value dau tien hop le
  for (const value of values) {
    // 1. Kiem tra: value khong phai undefined, null, hoac chuoi rong
    if (value !== undefined && value !== null && value !== "") {
      return value;  // Return value dau tien tim thay
    }
  }

  // 2. Neu toan bo values khong hop le - tra ve chuoi rong
  return "";
}

function normalizeGif(item) {
  // 1. Extract bien 'images' tu GIPHY API response item
  const images = item?.images || {};
  
  // 2. Tim variant anh hoat hinh (animation) - thu cac lua chon theo thu tu uu tien
  const animatedVariant = pickFirstObject(images, [
    "fixed_width",       // Uu tien 1: fixed width
    "fixed_height",      // Uu tien 2: fixed height
    "downsized",         // Uu tien 3: downsized
    "original",          // Uu tien 4: original
  ]);
  
  // 3. Tim variant anh xem truoc (preview) - lat dep va nhanh
  const previewVariant = pickFirstObject(images, [
    "preview_webp",       // Uu tien 1: WebP format (nho hon)
    "fixed_width_small",  // Uu tien 2: small fixed width
    "fixed_height_small", // Uu tien 3: small fixed height
    "fixed_width",        // Uu tien 4: fallback
  ]);
  
  // 4. Tim variant anh tinh lang (still image) - khong hoat hinh
  const stillVariant = pickFirstObject(images, [
    "fixed_width_still",   // Uu tien 1
    "fixed_height_still",  // Uu tien 2
    "downsized_still",     // Uu tien 3
  ]);

  // 5. Lay URL anh hoat hinh: uu tien webp (nho hon), hoac fallback ve url
  const url = pickFirstValue([animatedVariant?.url, animatedVariant?.webp]);

  // 6. Neu khong tim thay anh hoat hinh - bo qua item nay
  if (!url) {
    return null;
  }

  // 7. Lay URL preview: uu tien webp, sau do url, hoac cuoi cung dung url chinh
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
  // 1. Tim cache entry theo key
  const cached = responseCache.get(key);
  // 2. Neu khong co - tra ve null
  if (!cached) {
    return null;
  }

  // 3. Kiem tra cache co het han (expiresAt) khong
  if (cached.expiresAt <= Date.now()) {
    // 4. Neu het han - xoa cache entry va tra ve null
    responseCache.delete(key);
    return null;
  }

  // 5. Neu con han - tra ve payload
  return cached.payload;
}

function setCachedPayload(key, payload, ttlMs) {
  // 1. Luu cache entry voi TTL (time to live)
  responseCache.set(key, {
    payload,
    expiresAt: Date.now() + ttlMs,  // Expires = now + TTL milliseconds
  });

  // 2. Kiem tra kich thuoc cache (neu vuot 80 entries - xoa entry cu nhat)
  // Tranh memory leak: cache co han che kich thuoc
  if (responseCache.size > 80) {
    const oldestKey = responseCache.keys().next().value;  // Get first (oldest) key
    if (oldestKey) {
      responseCache.delete(oldestKey);  // Delete oldest entry
    }
  }

  // 3. Tra ve payload vua set
  return payload;
}

async function fetchGiphyFeed(url, cacheKey, ttlMs) {
  // 1. Kiem tra cache truoc: neu co va con han - tra ve ngay
  const cachedPayload = getCachedPayload(cacheKey);
  if (cachedPayload) {
    return cachedPayload;
  }

  // 2. Neu khong co trong cache - fetch tu GIPHY API
  const response = await fetch(url);
  // 3. Kiem tra HTTP response status: neu khong ok (200-299) - throw error
  if (!response.ok) {
    throw httpError(502, `GIPHY request failed with status ${response.status}`);
  }

  // 4. Parse JSON response tu GIPHY API
  const data = await response.json();
  // 5. Tao normalized payload:
  //    - data: array GIFs da normalize (loai bo items khong hop le)
  //    - pagination: info chot trang (neu co)
  //    - meta: metadata (neu co)
  const payload = {
    data: Array.isArray(data?.data)
      ? data.data.map(normalizeGif).filter(Boolean)  // Map & filter null values
      : [],
    pagination: data?.pagination || null,
    meta: data?.meta || null,
  };

  // 6. Luu payload vao cache voi TTL va tra ve
  return setCachedPayload(cacheKey, payload, ttlMs);
}

/**
 * Tìm kiếm hàng ánh GIF từ GIPHY API
 * Hó trợ cache, giới hạn kết quả, đồng kếnh xếp hạng
 * @param {Object} req - Express request object, chứa q (query), limit, rating trong query
 * @param {Object} res - Express response object
 */
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

/**
 * Lấy hàng GIF xu hướng hiện tại từ GIPHY
 * @param {Object} req - Express request object, chứa limit và rating trong query
 * @param {Object} res - Express response object
 */
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

/**
 * Proxy GIF từ GIPHY đến client, kiểm tra host đã cho phép
 * @param {Object} req - Express request object, chứa URL trong query params
 * @param {Object} res - Express response object
 */
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

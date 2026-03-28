const express = require("express");
const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const httpError = require("../utils/httpError");

const router = express.Router();

const ALLOWED_HOSTS = new Set([
  "media.giphy.com",
  "media1.giphy.com",
  "media2.giphy.com",
  "media3.giphy.com",
  "media4.giphy.com",
  "i.giphy.com",
]);

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    if (!env.giphyApiKey) {
      throw httpError(503, "GIPHY API key missing");
    }

    const url = new URL("https://api.giphy.com/v1/gifs/search");
    url.searchParams.set("api_key", env.giphyApiKey);
    url.searchParams.set("q", req.query.q || "");
    url.searchParams.set("limit", String(req.query.limit || 12));
    url.searchParams.set("rating", String(req.query.rating || "g"));
    res.json(await fetchJson(url));
  }),
);

router.get(
  "/trending",
  asyncHandler(async (req, res) => {
    if (!env.giphyApiKey) {
      throw httpError(503, "GIPHY API key missing");
    }

    const url = new URL("https://api.giphy.com/v1/gifs/trending");
    url.searchParams.set("api_key", env.giphyApiKey);
    url.searchParams.set("limit", String(req.query.limit || 12));
    url.searchParams.set("rating", String(req.query.rating || "g"));
    res.json(await fetchJson(url));
  }),
);

router.get(
  "/proxy",
  asyncHandler(async (req, res) => {
    if (!env.giphyApiKey) {
      throw httpError(503, "GIPHY API key missing");
    }

    if (!req.query.url) {
      throw httpError(400, "Thiếu URL");
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
  }),
);

module.exports = router;

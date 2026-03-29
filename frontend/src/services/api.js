import axios from "axios";

const API_URL = (
  import.meta.env.VITE_API_URL?.trim() ||
  (typeof window !== "undefined" ? `${window.location.origin}/api` : "/api")
).replace(/\/+$/, "");
export const API_HOST = API_URL.replace(/\/api$/, "");

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

const MAX_SINGLE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_MANGA_UPLOAD_BATCH_FILES = 8;
const MAX_MANGA_UPLOAD_BATCH_BYTES = 20 * 1024 * 1024;

const hasIdParam = (value) =>
  value !== undefined &&
  value !== null &&
  String(value).trim() !== "" &&
  String(value).trim() !== "undefined" &&
  String(value).trim() !== "null";

const getStoredUser = () => {
  try {
    const rawUser = localStorage.getItem("user");
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (error) {
    console.error("Invalid user session in localStorage:", error);
    localStorage.removeItem("user");
    return null;
  }
};

api.interceptors.request.use((config) => {
  const user = getStoredUser();
  const accessToken = user?.accessToken || user?.token;
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    if (typeof config.headers?.setContentType === "function") {
      config.headers.setContentType(undefined);
    } else if (config.headers) {
      delete config.headers["Content-Type"];
      delete config.headers["content-type"];
    }
  }
  return config;
});


// Interceptor để xử lý lỗi im lặng cho các request được đánh dấu
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Nếu request được đánh dấu silent, không log lỗi
    if (!error.config?.silent) {
      console.error('API Error:', error.response?.data?.message || error.message);

    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (username, password) =>
  api.post("/auth/signin", { username, password });
export const register = (username, email, password) =>
  api.post("/auth/signup", { username, email, password });

export const googleLogin = (credential) =>
  api.post("/auth/google", { credential });

export const forgotPassword = (email) =>
  api.post("/auth/forgot-password", { email });
export const resetPassword = (token, newPassword) =>
  api.post("/auth/reset-password", { token, newPassword });

// Stories
export const getStories = () => api.get("/stories");
export const getManageStories = (approvalStatus) =>
  api.get("/stories/manage", { params: approvalStatus ? { approvalStatus } : {} });
export const getMyStories = () => api.get("/stories/mine");
export const getStoriesForReview = (approvalStatus = "PENDING") =>
  api.get("/stories/review", { params: { approvalStatus } });
export const getStory = (id, options = {}) =>
  api.get(`/stories/${id}`, {
    params: options.optional ? { optional: "1" } : undefined,
  });
export const searchStories = (params) => api.get("/stories/search", { params });
export const getTrendingStories = (limit = 10) =>
  api.get("/stories/trending", { params: { limit } });
export const getNewReleases = (limit = 10) =>
  api.get("/stories/new-releases", { params: { limit } });
export const getLicensedStories = (limit = 10) =>
  api.get("/stories/licensed", { params: { limit } });
export const getRecommendations = (userId, limit = 10) =>
  api.get("/stories/recommendations", { params: { userId, limit } });
export const createStory = (data) => api.post("/stories", data);
export const updateStory = (id, data) => api.put(`/stories/${id}`, data);
export const reviewStory = (id, approvalStatus, reviewNote = "") =>
  api.put(`/stories/${id}/approval`, { approvalStatus, reviewNote });
export const deleteStory = (id) => api.delete(`/stories/${id}`);
export const getFollowedStories = () => api.get("/stories/followed");
export const incrementViews = (id) => api.put(`/stories/${id}/views`);
export const followStory = (id) => api.post(`/stories/${id}/follow`);
export const isFollowing = (id) => api.get(`/stories/${id}/is-following`);
export const getRelatedStories = (id) => api.get(`/stories/${id}/related`);

// Categories
export const getCategories = () => api.get("/categories");
export const createCategory = (data) => api.post("/categories", data);
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);

// Authors
export const getAuthors = () => api.get("/authors");

// Chapters
export const getChaptersByStory = (storyId) =>
  hasIdParam(storyId)
    ? api.get(`/chapters/story/${storyId}`)
    : Promise.resolve({ data: [] });
export const getManageChaptersByStory = (storyId) =>
  api.get(`/chapters/story/${storyId}/manage`);
export const getMyChapters = () => api.get("/chapters/mine");
export const getChaptersForReview = (params = { approvalStatus: "PENDING" }) =>
  api.get("/chapters/review", { params });
export const getChapter = (id, options = {}) =>
  api.get(`/chapters/${id}`, {
    params: options.optional ? { optional: "1" } : undefined,
  });
export const createChapter = (data) => api.post("/chapters", data);
export const updateChapter = (id, data) => api.put(`/chapters/${id}`, data);
export const reviewChapter = (id, approvalStatus, reviewNote = "") =>
  api.put(`/chapters/${id}/approval`, { approvalStatus, reviewNote });
export const deleteChapter = (id) => api.delete(`/chapters/${id}`);

// Comments
export const getCommentsByStory = (storyId) =>
  api.get(`/comments/story/${storyId}`);
export const getCommentThreadByChapter = (chapterId) =>
  api.get(`/comments/chapter/${chapterId}/thread`);
export const getCommentsByChapter = (chapterId) =>
  api.get(`/comments/chapter/${chapterId}`);
export const getCommentsByPage = (chapterId, pageIndex) =>
  api.get(`/comments/chapter/${chapterId}/page/${pageIndex}`);
export const createComment = (data) => api.post("/comments", data);
export const deleteComment = (id) => api.delete(`/comments/${id}`);

// Users
export const getPublicUserProfile = (id) => api.get(`/users/${id}/public`);

// Ratings
export const rateStory = (data) => api.post("/ratings", data);
export const getStoryRating = (storyId) => api.get(`/ratings/story/${storyId}`);
export const getUserRating = (storyId) =>
  api.get(`/ratings/story/${storyId}/user`);

// Bookmarks
export const getBookmarks = () => api.get("/bookmarks");
export const addBookmark = (data) => api.post("/bookmarks", data);
export const deleteBookmark = (id) => api.delete(`/bookmarks/${id}`);
export const getReaderNotesByChapter = (storyId, chapterId) =>
  api.get(`/reader-notes/story/${storyId}/chapter/${chapterId}`);
export const saveReaderNote = (data) => api.post("/reader-notes", data);
export const deleteReaderNote = (storyId, chapterId, params) =>
  api.delete(`/reader-notes/story/${storyId}/chapter/${chapterId}`, { params });

// Reading History
export const getReadingHistory = () => api.get("/reading-history");
export const getReadingHistoryByStory = (storyId) =>
  api.get(`/reading-history/story/${storyId}`);
export const saveReadingHistory = (data) => api.post("/reading-history", data);
export const deleteReadingHistoryItem = (id) =>
  api.delete(`/reading-history/${id}`);

// Payments
export const getWalletSummary = () => api.get("/payments/wallet");
export const createMomoTopUp = (data) => api.post("/payments/momo/top-up", data);
export const confirmMomoTopUp = (data) => api.post("/payments/momo/confirm", data);
export const exchangeWalletToCoins = (amount) =>
  api.post("/payments/coins/exchange", { amount });
export const unlockLicensedStory = (storyId, paymentMethod = "WALLET") =>
  api.post(`/payments/stories/${storyId}/unlock`, { paymentMethod });
export const unlockChapter = (chapterId) =>
  api.post(`/payments/chapters/${chapterId}/unlock`);
export const unlockChapterBundle = (storyId, chapterIds) =>
  api.post(`/payments/stories/${storyId}/chapter-bundles/unlock`, { chapterIds });
export const rentStory = (storyId) =>
  api.post(`/payments/stories/${storyId}/rent`);
export const supportAuthor = (storyId, amount) =>
  api.post(`/payments/stories/${storyId}/support`, { amount });
export const unlockProfileSkin = (skinId) =>
  api.post(`/payments/skins/${skinId}/unlock`);
export const equipProfileSkin = (skinId) =>
  api.put(`/payments/skins/${skinId}/equip`);

// Notifications
export const getNotifications = () => api.get("/notifications");
export const getUnreadCount = () => api.get("/notifications/unread-count");
export const markAsRead = (id) => api.put(`/notifications/${id}/read`);
export const markAllAsRead = () => api.put("/notifications/read-all");

// Reactions
export const getReactionSummary = (targetType, targetId) =>
  api.get("/reactions/summary", { params: { targetType, targetId } });
export const getReactionBatchSummary = (targets) =>
  api.post("/reactions/batch-summary", { targets });
export const setReaction = (data) => api.put("/reactions", data);

// Reports
export const createReport = (data) => api.post("/reports", data);
export const getReports = () => api.get("/reports");
export const updateReportStatus = (id, status) =>
  api.put(`/reports/${id}/status`, { status });

// GIFs (Giphy proxy)
export const searchGifs = (q, limit = 12) =>
  api.get("/gifs/search", { params: { q, limit } });
export const trendingGifs = (limit = 12) =>
  api.get("/gifs/trending", { params: { limit } });

// Admin
export const getAdminStats = () => api.get("/admin/stats");
export const getTrendStats = () => api.get("/admin/stats/trends");
export const getHotStories = (limit = 10) =>
  api.get("/stories/hot", { params: { limit } });
export const getDistributionData = () => api.get("/admin/stats/distribution");

// Upload (Cloudinary)
export const uploadImage = (file) => {
  validateUploadFiles([file]);
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/upload/image", fd);
};

const createMangaUploadBatches = (files) => {
  const batches = [];
  let currentBatch = [];
  let currentBatchBytes = 0;

  files.forEach((file) => {
    const fileSize = file?.size || 0;
    const exceedsBatchLimit =
      currentBatch.length >= MAX_MANGA_UPLOAD_BATCH_FILES ||
      (currentBatch.length > 0 && currentBatchBytes + fileSize > MAX_MANGA_UPLOAD_BATCH_BYTES);

    if (exceedsBatchLimit) {
      batches.push(currentBatch);
      currentBatch = [file];
      currentBatchBytes = fileSize;
      return;
    }

    currentBatch.push(file);
    currentBatchBytes += fileSize;
  });

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

const validateUploadFiles = (files) => {
  const oversizedFile = files.find((file) => (file?.size || 0) > MAX_SINGLE_UPLOAD_BYTES);

  if (oversizedFile) {
    const fileSizeMb = ((oversizedFile.size || 0) / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Anh "${oversizedFile.name}" co dung luong ${fileSizeMb}MB, vuot gioi han 10MB moi file.`,
    );
  }
};

export const uploadMangaPages = async (files, options = {}) => {
  const fileList = Array.from(files || []);
  const { onBatchComplete } = options;

  if (!fileList.length) {
    return { data: { urls: [] } };
  }

  validateUploadFiles(fileList);

  const batches = createMangaUploadBatches(fileList);
  const uploadedUrls = [];

  try {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const fd = new FormData();
      batches[batchIndex].forEach((file) => fd.append("files", file));

      const response = await api.post("/upload/images", fd);
      const batchUrls = response.data?.urls || [];
      uploadedUrls.push(...batchUrls);

      onBatchComplete?.({
        batchIndex,
        totalBatches: batches.length,
        uploadedCount: uploadedUrls.length,
        totalFiles: fileList.length,
        batchUrls,
      });
    }

    return { data: { urls: uploadedUrls } };
  } catch (error) {
    error.uploadedUrls = uploadedUrls;
    error.uploadedCount = uploadedUrls.length;
    error.remainingFiles = fileList.slice(uploadedUrls.length);
    error.totalFiles = fileList.length;
    throw error;
  }
};

export default api;

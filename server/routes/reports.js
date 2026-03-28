const express = require("express");
const Report = require("../models/report");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");

const router = express.Router();

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUserDocument(req);
    await Report.create({
      userId: user.id,
      storyId: req.body.storyId,
      chapterId: req.body.chapterId || null,
      reason: req.body.reason,
    });

    res.json(buildMessage("Đã gửi báo lỗi thành công!"));
  }),
);

router.get(
  "/",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (_req, res) => {
    const reports = await Report.find({}).sort({ createdAt: -1 }).lean();
    res.json(reports.map(serializeDoc));
  }),
);

router.put(
  "/:id/status",
  requireAuth,
  requireRoles("ROLE_ADMIN"),
  asyncHandler(async (req, res) => {
    const report = await Report.findById(req.params.id);
    if (!report) {
      throw httpError(400, "Lỗi: Không tìm thấy báo lỗi!");
    }

    report.status = req.body.status;
    await report.save();
    res.json(buildMessage("Report status updated!"));
  }),
);

module.exports = router;

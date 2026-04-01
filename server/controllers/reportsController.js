const Report = require("../models/report");
const asyncHandler = require("../utils/asyncHandler");
const { getCurrentUserDocument } = require("../utils/currentUser");
const { buildMessage, serializeDoc } = require("../utils/serialize");
const httpError = require("../utils/httpError");

const createReport = asyncHandler(async (req, res) => {
  const user = await getCurrentUserDocument(req);
  await Report.create({
    userId: user.id,
    storyId: req.body.storyId,
    chapterId: req.body.chapterId || null,
    reason: req.body.reason,
  });

  res.json(buildMessage("ÄÃ£ gá»­i bÃ¡o lá»—i thÃ nh cÃ´ng!"));
});

const listReports = asyncHandler(async (_req, res) => {
  const reports = await Report.find({}).sort({ createdAt: -1 }).lean();
  res.json(reports.map(serializeDoc));
});

const updateReportStatus = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) {
    throw httpError(400, "Lá»—i: KhÃ´ng tÃ¬m tháº¥y bÃ¡o lá»—i!");
  }

  report.status = req.body.status;
  await report.save();
  res.json(buildMessage("Report status updated!"));
});

module.exports = {
  createReport,
  listReports,
  updateReportStatus,
};

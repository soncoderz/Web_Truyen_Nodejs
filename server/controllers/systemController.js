/**
 * Kiem tra tao thi mot he thong
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function health(_req, res) {
  res.json({ status: "ok", runtime: "node" });
}

module.exports = {
  health,
};

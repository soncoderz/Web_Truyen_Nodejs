function health(_req, res) {
  res.json({ status: "ok", runtime: "node" });
}

module.exports = {
  health,
};

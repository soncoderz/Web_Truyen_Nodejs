const User = require("../models/user");
const httpError = require("./httpError");

// Lấy document đầy đủ của người dùng hiện tại dựa trên thông tin
// đã được middleware xác thực gắn vào `req.user`.
async function getCurrentUserDocument(req) {
  // Nếu request chưa có `req.user.id` thì người dùng chưa đăng nhập
  // hoặc token không hợp lệ, nên trả về lỗi 401.
  if (!req.user?.id) {
    throw httpError(401, "Error: Unauthorized");
  }

  // Tìm người dùng trong database để lấy document mới nhất.
  const user = await User.findById(req.user.id);
  // Nếu không tìm thấy người dùng, xem như phiên đăng nhập không còn hợp lệ.
  if (!user) {
    throw httpError(401, "Error: Unauthorized");
  }

  // Trả về document user để controller/service tiếp tục sử dụng.
  return user;
}

module.exports = {
  getCurrentUserDocument,
};

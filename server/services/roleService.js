const Role = require("../models/role");
const { createDbRef, extractDbRefIds } = require("../utils/dbRefs");

async function ensureRoles() {
  const existing = await Role.find({ name: { $in: ["ROLE_USER", "ROLE_ADMIN"] } }).lean();
  const existingNames = new Set(existing.map((role) => role.name));
  const missingNames = ["ROLE_USER", "ROLE_ADMIN"].filter(
    (name) => !existingNames.has(name),
  );

  if (missingNames.length > 0) {
    await Role.insertMany(missingNames.map((name) => ({ name })));
  }
}

async function getRoleRefs(roleNames) {
  const roles = await Role.find({ name: { $in: roleNames } }).lean();
  if (roles.length !== roleNames.length) {
    throw new Error("Lỗi: Không tìm thấy vai trò.");
  }

  return roles.map((role) => createDbRef("roles", role._id));
}

async function resolveRoleNames(user) {
  const roleIds = extractDbRefIds(user?.roles);
  if (roleIds.length === 0) {
    return [];
  }

  const roles = await Role.find({ _id: { $in: roleIds } }).lean();
  const roleMap = new Map(roles.map((role) => [String(role._id), role.name]));

  return roleIds
    .map((roleId) => roleMap.get(roleId))
    .filter(Boolean);
}

module.exports = {
  ensureRoles,
  getRoleRefs,
  resolveRoleNames,
};

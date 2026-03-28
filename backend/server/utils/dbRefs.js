const { toIdString, toObjectId, ensureArray } = require("./normalize");

function createDbRef(collection, id) {
  const objectId = toObjectId(id);
  if (!objectId) {
    throw new Error(`Invalid MongoDB ObjectId for DBRef: ${id}`);
  }

  return {
    $ref: collection,
    $id: objectId,
  };
}

function extractDbRefIds(values) {
  return ensureArray(values)
    .map((value) => {
      if (!value) {
        return null;
      }

      if (typeof value?.toJSON === "function") {
        const jsonValue = value.toJSON();
        if (jsonValue?.$id) {
          return toIdString(jsonValue.$id);
        }
      }

      if (value.$id) {
        return toIdString(value.$id);
      }

      if (value.oid) {
        return toIdString(value.oid);
      }

      if (value._id) {
        return toIdString(value._id);
      }

      if (value.id) {
        return toIdString(value.id);
      }

      return toIdString(value);
    })
    .filter(Boolean);
}

module.exports = {
  createDbRef,
  extractDbRefIds,
};

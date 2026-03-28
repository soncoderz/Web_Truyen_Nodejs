const { toIdString } = require("./normalize");

function serializeDoc(document) {
  if (!document) {
    return null;
  }

  const plain =
    typeof document.toObject === "function"
      ? document.toObject({ depopulate: true })
      : { ...document };

  plain.id = toIdString(plain._id ?? plain.id);
  delete plain._id;
  delete plain.__v;
  return plain;
}

function buildMessage(message) {
  return { message };
}

module.exports = {
  buildMessage,
  serializeDoc,
};

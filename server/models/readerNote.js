const { Schema, model } = require("mongoose");

const readerNoteSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    storyId: { type: String, required: true, index: true },
    chapterId: { type: String, required: true, index: true },
    pageIndex: Number,
    paragraphIndex: Number,
    note: String,
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "reader_notes",
  },
);

module.exports = model("ReaderNote", readerNoteSchema);

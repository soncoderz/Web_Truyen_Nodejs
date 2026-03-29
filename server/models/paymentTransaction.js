const { Schema, model } = require("mongoose");

const paymentTransactionSchema = new Schema(
  {
    userId: { type: String, index: true },
    storyId: String,
    chapterId: String,
    chapterIds: { type: [String], default: [] },
    targetUserId: String,
    type: String,
    provider: String,
    status: String,
    amount: Number,
    expiresAt: Date,
    metadata: { type: Schema.Types.Mixed, default: null },
    orderId: { type: String, index: true, sparse: true },
    requestId: String,
    payUrl: String,
    providerTransactionId: Number,
    message: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "payment_transactions",
  },
);

module.exports = model("PaymentTransaction", paymentTransactionSchema);

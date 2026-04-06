const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

router.post("/signin", authController.signIn);
router.post("/signup", authController.signUp);
router.post("/google", authController.signInWithGoogle);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;

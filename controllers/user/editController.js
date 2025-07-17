const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const STATUS_CODES = require('../../helpers/statusCodes');

require("dotenv").config();

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD,
  },
});

const generateOtp = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const sendVerificationEmail = async (email, otp) => {
  try {
    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Your OTP for Email/Password Change",
      text: `Your OTP is ${otp}. Valid for 10 minutes.`,
      html: `<b><h4>Your OTP: ${otp}</h4></b>`,
    };
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}: ${otp}`);
    return true;
  } catch (error) {
    console.error(`Error sending email to ${email}:`, error.stack);
    return false;
  }
};

const securePassword = async (password) => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error("Error hashing password:", error.stack);
    throw new Error("Failed to hash password");
  }
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const renderEditProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      console.warn("No userId in session, redirecting to login");
      return res.redirect("/login");
    }
    const user = await User.findById(userId);
    if (!user) {
      console.warn(`User not found for ID: ${userId}, redirecting to login`);
      return res.redirect("/login");
    }
    res.render("edit-profile", { user, currentPath: "/edit-profile" });
  } catch (error) {
    console.error("Error rendering edit profile:", error.stack);
    res.redirect("/pageNotFound");
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { name } = req.body;
    if (!name || name.length < 3) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Username must be at least 3 characters long" });
    }
    await User.findByIdAndUpdate(userId, { name });
    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Error updating profile:", error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error: Failed to update profile" });
  }
};

const changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.session.user);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);
    if (!isMatch) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Old password incorrect" });
    }

    // Check if new password is same as current password
    const isSamePassword = await bcrypt.compare(req.body.newPassword, user.password);
    if (isSamePassword) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "New password cannot be the same as the current password" });
    }

    const hashedNew = await bcrypt.hash(req.body.newPassword, 10);
    user.password = hashedNew;
    await user.save();

    res.status(STATUS_CODES.OK).json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Something went wrong" });
  }
};

// Verify OTP for password change
const verifyPasswordOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Verifying password OTP, session userId:", userId);
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "User not found" });
    }

    if (user.otp !== otp || Date.now() > user.otpExpires) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid or expired OTP" });
    }

    user.password = user.tempNewPassword;
    user.tempNewPassword = null;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Error verifying password OTP:", error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error: Failed to verify password OTP" });
  }
};

// Resend OTP for password change
const resendPasswordOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Resending password OTP, session userId:", userId);
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Unauthorized: Please log in" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "User not found" });
    }
    if (!user.tempNewPassword) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "No pending password change request" });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const emailSent = await sendVerificationEmail(user.email, otp);
    if (!emailSent) {
      return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP resent to your email" });
  } catch (error) {
    console.error("Error resending password OTP:", error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error: Failed to resend password OTP" });
  }
};

const sendOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Sending OTP, session userId:", userId);
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { email, type } = req.body;
    if (!validateEmail(email)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid email address" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "User not found" });
    }

    if (type === "verify-current" && user.email !== email) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Email does not match current email" });
    }
    if (type === "new-email") {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Email already in use" });
      }
      user.tempNewEmail = email;
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; 
    await user.save();

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Error sending OTP:", error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error: Failed to send OTP" });
  }
};

const resendOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Resending OTP, session userId:", userId);
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Unauthorized: Please log in" });
    }

    const { email, type } = req.body;
    if (!validateEmail(email)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid email address" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "User not found" });
    }

    if (type === "verify-current" && user.email !== email) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Email does not match current email" });
    }

    if (type === "new-email" && user.tempNewEmail !== email) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "No pending email change request" });
    }

    if (type === "password" && !user.tempNewPassword) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "No pending password change request" });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP resent to your email" });
  } catch (error) {
    console.error("Error resending OTP:", error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error: Failed to resend OTP" });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Verifying OTP, session userId:", userId);
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { email, otp, type } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "User not found" });
    }

    if (user.otp !== otp || Date.now() > user.otpExpires) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid or expired OTP" });
    }

    if (type === "verify-current") {
      user.otp = null;
      user.otpExpires = null;
      await user.save();
      return res.json({ success: true, message: "Current email verified" });
    }

    if (type === "new-email" && user.tempNewEmail === email) {
      user.email = user.tempNewEmail;
      user.tempNewEmail = null;
      user.otp = null;
      user.otpExpires = null;
      await user.save();
      return res.json({ success: true, message: "Email updated successfully" });
    }

    res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid request" });
  } catch (error) {
    console.error("Error verifying OTP:", error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error: Failed to verify OTP" });
  }
};

const editresendOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("resend otp is working");
    console.log("Resending OTP, session userId:", userId);
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { email, type } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "User not found" });
    }

    if (type === "verify-current" && user.email !== email) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Email does not match current email" });
    }
    if (type === "new-email" && user.tempNewEmail !== email) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "No pending email change request" });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP resent to your email" });
  } catch (error) {
    console.error("Error resending OTP:", error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error: Failed to resend OTP" });
  }
};

const newMailConfirmation = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Confirming new email, session userId:", userId);
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Unauthorized: Please log in" });
    }

    const { otp, email } = req.body;
    if (!validateEmail(email) || !otp) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid email or OTP" });
    }

    const user = await User.findById(userId);
    console.log("user details :",user);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "User not found" });
    }

    if(user.otp !== otp){
        console.log("user.otp & otp:",user.otp , otp);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "incorrect otp" });
    }

    if (user.otp !== otp || Date.now() > user.otpExpires) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid or expired OTP" });
    }

    if (user.tempNewEmail !== email) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Email does not match pending email change" });
    }

    user.email = email;
    user.tempNewEmail = null;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    return res.json({ success: true, msg: "Email updated successfully" });
  } catch (error) {
    console.error("Error confirming new email:", error.stack);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error: Failed to confirm email" });
  }
};

const sendOtpForNewEmail = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Sending OTP for new email, session userId:", userId);
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Unauthorized: Please log in" });
    }

    const { email } = req.body;
    if (!validateEmail(email)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid email address" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "User not found" });
    }

    if (email === user.email) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "New email is the same as current email" });
    }

    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Email already in use" });
    }

    const otp = generateOtp();
    user.tempNewEmail = email;
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP sent to new email" });
  } catch (error) {
    console.error("Error sending OTP for new email:", error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Server error: Failed to send OTP" });
  }
};

module.exports = {
  renderEditProfile,
  updateProfile,
  sendOtp,
  resendOtp,
  verifyOtp,
  editresendOtp,
  changePassword,
  verifyPasswordOtp,
  resendPasswordOtp,
  newMailConfirmation,
  sendOtpForNewEmail
};
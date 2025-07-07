const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

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
// async function newMailConfirmation(req, res) {
//   try {
   
    
//     const userId = req.session.user;
//     const { otp, email } = req.body;

//     console.log("Rendering edit profile, session userId:", userId);

//     if (!userId) {
//       console.warn("No userId in session, redirecting to login");
//       return res.redirect("/login");
//     }

//     const userData = await User.findById(userId);
//     if (!userData) return res.redirect("/login");

//     if (userData.otp == otp) {
//       await User.findByIdAndUpdate(userId, { email }); 
//       return res.json({ok:true,msg:"Profile updated succes fully"});
//     } else {
//       return res.render("editProfile", { error: "Invalid OTP" }); 
//     }

//   } catch (error) {
//     console.error(error);
//     return res.status(500).send("Server error"); 
//   }
// }

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

// const uploadProfilePhoto = async (req, res) => {
//   try {
//     const userId =req.session.user
//     console.log("userId",userId)
// //     if (!userId) {
// //       return res.status(401).json({ success: false, message: 'Unauthorized' });
// //     }
// console.log("req.file",req.file)
// //     if (!req.file) {
      
// //       return res.status(400).json({ success: false, message: 'No file uploaded' });
// //     }

// //     // Construct the file path to be stored in the database
// //     const profilePhotoUrl = `/uploads/profile/${req.file.filename}`;

// //     // Update the user's profile photo in the database
// //     const user = await User.findByIdAndUpdate(
// //        req.session.user,
// //       { profileImage: profilePhotoUrl },
// //       { new: true }
// //     );

// //     if (!user) {
// //       return res.status(404).json({ success: false, message: 'User not found' });
// //     }
// console.log("photo upload")
//     res.status(200).json({
//       success: true,
//       message: 'Profile photo updated successfully',
//       // profilePhotoUrl: profilePhotoUrl
//     });
//   } catch (error) {
//     console.error('Error uploading profile photo:', error);
//     res.status(500).json({ success: false, message: 'Server error during upload' });
//   }
//  }

const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { name } = req.body;
    if (!name || name.length < 3) {
      return res.status(400).json({ success: false, message: "Username must be at least 3 characters long" });
    }
    await User.findByIdAndUpdate(userId, { name });
    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Error updating profile:", error.stack);
    res.status(500).json({ success: false, message: "Server error: Failed to update profile" });
  }
};

// const sendOtp = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     console.log("Sending OTP, session userId:", userId);
//     console.log("fgnvjnf")
//     if (!userId) {
//       return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
//     }
//     const { email, type } = req.body;
//     if (!validateEmail(email)) {
//       return res.status(400).json({ success: false, message: "Invalid email address" });
//     }

//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     if (type === "verify-current" && user.email !== email) {
//       return res.status(400).json({ success: false, message: "Email does not match current email" });
//     }
//     if (type === "new-email") {
//       const existingUser = await User.findOne({ email, _id: { $ne: userId } });
//       if (existingUser) {
//         return res.status(400).json({ success: false, message: "Email already in use" });
//       }
//       user.tempNewEmail = email;
//     }

//     const otp = generateOtp();
//     user.otp = otp;
//     user.otpExpires = Date.now() + 10 * 60 * 1000; 
//     await user.save();

//     const emailSent = await sendVerificationEmail(email, otp);
//     if (!emailSent) {
//       return res.status(500).json({ success: false, message: "Failed to send OTP" });
//     }

//     res.json({ success: true, message: "OTP sent to your email" });
//   } catch (error) {
//     console.error("Error sending OTP:", error.stack);
//     res.status(500).json({ success: false, message: "Server error: Failed to send OTP" });
//   }
// };




// Verify OTP for email change


// const verifyOtp = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     console.log("abcddedd")
//     console.log("Verifying OTP, session userId:", userId);
//     if (!userId) {
//       return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
//     }
//     const { email, otp, type } = req.body;

//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }
//     console.log(user)
//     console.log("verufy",otp);
//     console.log("user otp",user.otp)
//     if (user.otp !== otp || Date.now() > user.otpExpires) {
//       return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
//     }

//     if (type === "verify-current") {
//       user.otp = null;
//       user.otpExpires = null;
//       await user.save();
//       return res.json({ success: true, message: "Current email verified" });
//     }

//     if (type === "new-email" && user.tempNewEmail === email) {
//       user.email = user.tempNewEmail;
//       user.tempNewEmail = null;
//       user.otp = null;
//       user.otpExpires = null;
//       await user.save();
//       return res.json({ success: true, message: "Email updated successfully" });
//     }

//     res.status(400).json({ success: false, message: "Invalid request" });
//   } catch (error) {
//     console.error("Error verifying OTP:", error.stack);
//     res.status(500).json({ success: false, message: "Server error: Failed to verify OTP" });
//   }
// };

// Resend OTP
// const resendOtp = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     console.log("Resending OTP, session userId:", userId);
//     if (!userId) {
//       return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
//     }
//     const { email, type } = req.body;

//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     if (type === "verify-current" && user.email !== email) {
//       return res.status(400).json({ success: false, message: "Email does not match current email" });
//     }
//     if (type === "new-email" && user.tempNewEmail !== email) {
//       return res.status(400).json({ success: false, message: "No pending email change request" });
//     }

//     const otp = generateOtp();
//     user.otp = otp;
//     user.otpExpires = Date.now() + 10 * 60 * 1000;
//     await user.save();

//     const emailSent = await sendVerificationEmail(email, otp);
//     if (!emailSent) {
//       return res.status(500).json({ success: false, message: "Failed to send OTP" });
//     }

//     res.json({ success: true, message: "OTP resent to your email" });
//   } catch (error) {
//     console.error("Error resending OTP:", error.stack);
//     res.status(500).json({ success: false, message: "Server error: Failed to resend OTP" });
//   }
// };

// Change password
// const changePassword = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     console.log("Changing password, session userId:", userId);
//     if (!userId) {
//       return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
//     }
//     const { currentPassword, newPassword } = req.body;

//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }
//     if (!user.password) {
//       return res.status(400).json({ success: false, message: "Password not set (Google account?)" });
//     }

//     const isMatch = await bcrypt.compare(currentPassword, user.password);
//     if (!isMatch) {
//       return res.status(400).json({ success: false, message: "Current password is incorrect" });
//     }

    
// if(isMatch){
//    user.password = user.tempNewPassword;
//     user.tempNewPassword = null;
//     user.otp = null;
//     user.otpExpires = null;
//     await user.save();

//     res.json({ success: true, message: "Password changed successfully" });

// }
//     // res.json({ success: true, message: "OTP sent to your email" });
//   } catch (error) {
//     console.error("Error changing password:", error.stack);
//     res.status(500).json({ success: false, message: "Server error: Failed to initiate password change" });
//   }
// };




const changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.session.user);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Old password incorrect" });
    }

    const hashedNew = await bcrypt.hash(req.body.newPassword, 10);
    user.password = hashedNew;
    await user.save();

    res.status(200).json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};







// Verify OTP for password change
const verifyPasswordOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Verifying password OTP, session userId:", userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.otp !== otp || Date.now() > user.otpExpires) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    user.password = user.tempNewPassword;
    user.tempNewPassword = null;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Error verifying password OTP:", error.stack);
    res.status(500).json({ success: false, message: "Server error: Failed to verify password OTP" });
  }
};

// Resend OTP for password change
const resendPasswordOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Resending password OTP, session userId:", userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (!user.tempNewPassword) {
      return res.status(400).json({ success: false, message: "No pending password change request" });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const emailSent = await sendVerificationEmail(user.email, otp);
    if (!emailSent) {
      return res.status(500).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP resent to your email" });
  } catch (error) {
    console.error("Error resending password OTP:", error.stack);
    res.status(500).json({ success: false, message: "Server error: Failed to resend password OTP" });
  }
};



const sendOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Sending OTP, session userId:", userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { email, type } = req.body;
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (type === "verify-current" && user.email !== email) {
      return res.status(400).json({ success: false, message: "Email does not match current email" });
    }
    if (type === "new-email") {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: "Email already in use" });
      }
      user.tempNewEmail = email;
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; 
    await user.save();

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(500).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Error sending OTP:", error.stack);
    res.status(500).json({ success: false, message: "Server error: Failed to send OTP" });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Verifying OTP, session userId:", userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { email, otp, type } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.otp !== otp || Date.now() > user.otpExpires) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
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

    res.status(400).json({ success: false, message: "Invalid request" });
  } catch (error) {
    console.error("Error verifying OTP:", error.stack);
    res.status(500).json({ success: false, message: "Server error: Failed to verify OTP" });
  }
};

const resendOtp = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("resend otp is working")
    console.log("Resending OTP, session userId:", userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
    }
    const { email, type } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (type === "verify-current" && user.email !== email) {
      return res.status(400).json({ success: false, message: "Email does not match current email" });
    }
    if (type === "new-email" && user.tempNewEmail !== email) {
      return res.status(400).json({ success: false, message: "No pending email change request" });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(500).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP resent to your email" });
  } catch (error) {
    console.error("Error resending OTP:", error.stack);
    res.status(500).json({ success: false, message: "Server error: Failed to resend OTP" });
  }
};

const newMailConfirmation = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log("Confirming new email, session userId:", userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Please log in" });
    }

    const { otp, email } = req.body;
    if (!validateEmail(email) || !otp) {
      return res.status(400).json({ success: false, message: "Invalid email or OTP" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.otp !== otp || Date.now() > user.otpExpires) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    if (user.tempNewEmail !== email) {
      return res.status(400).json({ success: false, message: "Email does not match pending email change" });
    }

    user.email = email;
    user.tempNewEmail = null;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    return res.json({ ok: true, msg: "Email updated successfully" });
  } catch (error) {
    console.error("Error confirming new email:", error.stack);
    return res.status(500).json({ success: false, message: "Server error: Failed to confirm email" });
  }
};




module.exports = {
  renderEditProfile,
  // uploadProfilePhoto,
  updateProfile,
  sendOtp,
  verifyOtp,
  resendOtp,
  changePassword,
  verifyPasswordOtp,
  resendPasswordOtp,
  newMailConfirmation
};
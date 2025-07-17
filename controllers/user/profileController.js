const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Address =require('../../models/addressSchema')
const STATUS_CODES = require('../../helpers/statusCodes');

const nodemailer = require('nodemailer');
const bcrypt = require("bcrypt");
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const env = require("dotenv").config();
const { cloudinary } = require('../../helpers/cloudinary');



const sendVerificationEmail = async (email, otp) => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD,
            }
        });

        const mailOption = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Your OTP for password reset",
            text: `Your OTP is ${otp}`,
            html: `<b><h4>Your OTP : ${otp}</h4><br></b>`,
        };

        const info = await transporter.sendMail(mailOption);
        console.log("Email sent:", info.messageId);
        return true;
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
};

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        throw error;
    }
};

// Password Reset Functions
const getForgotPassPage = async (req, res) => {
    try {
        res.render("forgot-password");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const forgotEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        console.log("req.body", req.body);
        const findUser = await User.findOne({ email: email });
        if (findUser) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);

            if (emailSent) {
                req.session.userOtp = otp.otp;
                req.session.email = email;
                res.render("forgotPass-otp");
                console.log("OTP: ",  req.session.userOtp);
            } else {
                res.json({ success: false, message: "Failed to send OTP. Please try again" });
            }
        } else {
            res.render("forgot-password", {
                message: "User with this email does not exist"
            });
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const verifyForgotPassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;
        if (enteredOtp === req.session.userOtp) {
            req.session.resetAllowed = true;
            res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: "An error occurred, please try again" });
    }
};

const getResetPassPage = async (req, res) => {
    try {
        res.render("reset-password");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};



const postNewPassword = async (req, res) => {
    try {
        const { newPass1, newPass2 } = req.body;
        const email = req.session.email;

        if (newPass1 === newPass2) {
            const passwordHash = await securePassword(newPass1);
            await User.updateOne(
                { email: email },
                { $set: { password: passwordHash } }
            );

            req.session.userOtp = null;
            req.session.email = null;
            req.session.resetAllowed = null;

            res.redirect("/login");
        } else {
            res.render("reset-password", { message: "Passwords do not match" });
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

// Profile Functions
const loadProfilePage = async (req, res) => {
    try {
        console.log("✅ loadProfilePage called")
        const userId = req.session.userId;
        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/login');
        }
        res.render('profile');
    } catch (error) {
        console.error('Error retrieving profile data', error);
        res.redirect('/pageNotFound');
    }
};

const loadEditProfile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);
        res.render('edit-profile', { user, currentPath: '/edit-profile' });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { name, phone } = req.body;
        await User.findByIdAndUpdate(userId, { name, phone });
        res.redirect('/profile');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

// const uploadProfilePhoto = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: 'No file uploaded' });
//     }

//     const userId = req.session.user; // Assuming req.user is set by authMiddleware
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: 'User not found' });
//     }

//     // Delete old profile photo if it's not the default
//     if (user.profilePhoto && user.profilePhoto !== '/uploads/profile/default.jpg') {
//       try {
//         await fs.unlink(path.join(__dirname, '../public', user.profilePhoto));
//       } catch (err) {
//         console.error('Error deleting old profile photo:', err);
//       }
//     }

//     // Update user with new profile photo path
//     user.profilePhoto = `/uploads/profile/${req.file.filename}`;
//     await user.save();

//     res.json({
//       success: true,
//       message: 'Profile photo updated successfully',
//       profilePhotoUrl: user.profilePhoto
//     });
//   } catch (error) {
//     console.error('Error in uploadProfilePhoto:', error);
//     res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error' });
//   }
// };




const uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const userId = req.session.user;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete old image from cloudinary if available
    if (user.profilePhotoPublicId) {
      await cloudinary.uploader.destroy(user.profilePhotoPublicId);
    }

    // Save new Cloudinary URL and public_id
    user.profilePhoto = req.file.path; 
    user.profilePhotoPublicId = req.file.filename; 
    await user.save();

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      profilePhotoUrl: user.profilePhoto
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};



const getProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const addressDoc = await Address.findOne({ userId });
        const addresses = addressDoc ? addressDoc.address : [];
        res.render('user/profile', { address: addresses });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).send('Server error');
    }
};


const loadOrders = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orders = await Order.find({ userId }).populate('items.productId');
        res.render('orders', { orders, currentPath: '/orders' });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const cancelOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { reason } = req.body;
        await Order.findByIdAndUpdate(orderId, { status: 'Cancelled', cancelReason: reason });
        res.redirect('/orders');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};


// Configure nodemailer for sending OTP emails
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  
  // Validate email format and check for duplicates, excluding current user
  const validateEmail = async (email, userId) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email address');
    }
  
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      throw new Error('Email already in use');
    }
  };
  
  // Generate a 6-digit OTP and expiration time
  const generateOtp = () => {
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes
    return { otp, otpExpires };
  };
  
  // Store OTP and new email in user document
  const storeOtp = async (userId, otp, otpExpires, email) => {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    user.tempOtp = otp;
    user.tempOtpExpires = otpExpires;
    user.tempNewEmail = email;
    await user.save();
    return user;
  };
  
  // Send OTP via email and log OTP to terminal
  const sendOtpEmail = async (email, otp) => {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Email Change OTP Verification',
      text: `Your OTP for email change is ${otp}. It is valid for 10 minutes.`,
    };
  
    try {
      await transporter.sendMail(mailOptions);
      console.log(`OTP sent to ${email}: ${otp}`); // Log OTP to terminal
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send OTP email');
    }
  };
  
  // Clear temporary OTP fields
  const clearTempFields = async (userId) => {
    const user = await User.findById(userId);
    if (user) {
      user.tempOtp = null;
      user.tempOtpExpires = null;
      user.tempNewEmail = null;
      await user.save();
    }
  };
  
  // Verify OTP and retrieve user
  const verifyOtp = async (userId, email, otp) => {
    const user = await User.findById(userId);
    if (!user || user.tempNewEmail !== email) {
      await clearTempFields(userId); // Clear temp fields on invalid request
      throw new Error('Invalid request');
    }
  
    if (user.tempOtp !== otp || Date.now() > user.tempOtpExpires) {
      await clearTempFields(userId); // Clear temp fields on invalid/expired OTP
      throw new Error('Invalid or expired OTP');
    }
  
    return user;
  };
  
  // Update user's email and clear temporary fields
  const updateUserEmail = async (user, email) => {
    user.email = email;
    user.tempOtp = null;
    user.tempOtpExpires = null;
    user.tempNewEmail = null;
    await user.save();
  };
  
  // Controller: Send OTP to new email
  const sendOtp = async (req, res) => {
   
    try {

      const { email } = req.body;
  
      await validateEmail(email, req.user._id);
  
      // Generate OTP
      const { otp, otpExpires } = generateOtp();
  
      // Store OTP
      await storeOtp(req.user._id, otp, otpExpires, email);
  
      // Send OTP email
      await sendOtpEmail(email, otp);
  
      res.json({ success: true, message: 'OTP sent to your new email' });
    } catch (error) {
      console.error('Error sending OTP:', error);
      res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: error.message || 'Server error' });
    }
  };
  
  //  Verify OTP and update email
  const verifyOtpAndUpdateEmail = async (req, res) => {
    try {
      const { email, otp } = req.body;
  
      // Verify OTP
      const user = await verifyOtp(req.user._id, email, otp);
  
      // Update email
      await updateUserEmail(user, email);
  
      res.json({ success: true, message: 'Email updated successfully' });
    } catch (error) {
      console.error('Error updating email:', error);
      res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: error.message || 'Server error' });
    }
  };
  
  // Controller: Resend OTP (optional)
  const resendOtp = async (req, res) => {
    try {
      const user = await User.findById(req.sessio.user);
      if (!user || !user.tempNewEmail) {
        throw new Error('No pending email change request');
      }
  
      // Generate new OTP
      const { otp, otpExpires } = generateOtp();
  
      // Store new OTP
      await storeOtp(req.user._id, otp, otpExpires, user.tempNewEmail);
  
      // Send new OTP email
      await sendOtpEmail(user.tempNewEmail, otp);
  
      res.json({ success: true, message: 'New OTP sent to your email' });
    } catch (error) {
      console.error('Error resending OTP:', error);
      res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: error.message || 'Server error' });
    }
  };










const loadChangePassword = async (req, res) => {
    try {
        res.render('change-password', { currentPath: '/change-password' });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const updatePassword = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(userId);
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.render('change-password', { message: 'Current password is incorrect', currentPath: '/change-password' });
        }
        const passwordHash = await securePassword(newPassword);
        await User.findByIdAndUpdate(userId, { password: passwordHash });
        res.redirect('/profile');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const loadWalletPage = async (req, res) => {
    try {
        res.render('wallet', { currentPath: '/wallet' });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const loadCouponsPage = async (req, res) => {
    try {
        res.render('coupons', { currentPath: '/coupons' });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const loadCartPage = async (req, res) => {
    try {
        res.render('cart', { currentPath: '/cart' });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const loadCheckoutPage = async (req, res) => {
    try {
        res.render('checkout', { currentPath: '/checkout' });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};



const userProfile = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.redirect("/login");

    const userData = await User.findOne({ _id: user });

    const userAddress = await Address.findOne({ userId: user });

    if (!userAddress || userAddress.address.length === 0) {
      return res.render("userProfile", { user: userData, address: "" });
    }

  
    const primaryAddress = userAddress.address.find(addr => addr.isPrimary === true);

    return res.render("userProfile", { user: userData, address: primaryAddress || "" });

  } catch (error) {
    console.log("error while rendering userProfile ", error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).send("Server error");
  }
};


const addAddress1 = async (req, res) => {
    try {
      const userId = req.session.userId; 
      const { name, city, landmark, state, pincode, phone, altPhone } = req.body; 
  
      // Validate required fields
      if (!name || !city || !landmark || !state || !pincode || !phone) {
        return res.render('userProfile', {
          user: await User.findById(userId),
          message: 'All required fields must be filled',
        });
      }
  
      // Create the new address object
      const newAddress = {
        name,
        city,
        landmark,
        state,
        pincode,
        phone,
        altPhone: altPhone || '', // Optional field, default to empty string if not provided
      };
  
      // Add the new address to the user's addresses array
      await User.findByIdAndUpdate(userId, { $push: { addresses: newAddress } });
  
      // Render the success page
      res.render('address-success');
    } catch (error) {
      console.error('Error adding address:', error);
      res.redirect('/pageNotFound');
    }
  };





module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    loadProfilePage,
    loadEditProfile,
    updateProfile,
    // loadAddressPage,
    // addAddress,
    getProfile,
    loadOrders,
    cancelOrder,
    sendOtp,
    verifyOtpAndUpdateEmail,
    resendOtp,   
    userProfile,
    // addAddress1
uploadProfilePhoto

};
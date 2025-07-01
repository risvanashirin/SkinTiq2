
const express = require('express');
const router = express.Router();
const passport = require('passport');
const multer = require('multer');
const path = require('path');
const formParser = require('multer')();

const walletController = require('../controllers/user/walletController');
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController');
const editController = require('../controllers/user/editController');
const addressController = require('../controllers/user/addressController');
const wishlistController = require('../controllers/user/wishlistController');
const cartController = require('../controllers/user/cartController');
const orderController = require('../controllers/user/orderController');

const { userAuth } = require('../middlewares/auth');

// --- Multer Config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/profile/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `profile-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  cb(null, allowedTypes.includes(file.mimetype));
};
const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, 
  fileFilter
});

// --- Public & Auth Routes ---
router.get('/pageNotFound', userController.pageNotFound);
router.get('/', userController.loadHomepage);
router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.post('/verify-otp', userController.verifyOtp);
router.post('/resend-otp', userController.resendOtp);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err || !user) return res.redirect('/login');
    req.logIn(user, err => {
      if (err) return res.redirect('/login');
      req.session.user = user._id;
      res.redirect('/');
    });
  })(req, res, next);
});

router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.get('/logout', userController.logout);

// --- Password Reset ---
router.get('/forgot-password', profileController.getForgotPassPage);
router.post('/forgot-email-valid', profileController.forgotEmailValid);
router.post('/verify-passForgot-otp', profileController.verifyForgotPassOtp);
router.get('/reset-password', profileController.getResetPassPage);
router.post('/resend-forgot-otp', profileController.resendOtp);
router.post('/reset-password', profileController.postNewPassword);

// --- Protected Routes (need userAuth) ---
// Profile
router.get('/userProfile', userAuth, profileController.userProfile);

// Edit Profile
router.get('/edit-profile', userAuth, editController.renderEditProfile);
router.post('/update-profile', userAuth, editController.updateProfile);
router.post('/upload-profile-photo', userAuth, upload.single('profilePhoto'), profileController.uploadProfilePhoto);
router.post('/send-otp', userAuth, editController.sendOtp);
router.post('/edit/verify-otp', userAuth, editController.verifyOtp);
router.post('/confrom-new/email', userAuth, editController.newMailConfirmation);
router.post('/resend-otp', userAuth, editController.resendOtp);
router.post('/change-password', userAuth, editController.changePassword);
router.post('/verify-password-otp', userAuth, editController.verifyPasswordOtp);
router.post('/resend-password-otp', userAuth, editController.resendPasswordOtp);

// Wishlist
router.get('/wishlist', userAuth, wishlistController.getWishlist);
router.post('/addToWishlist', userAuth, wishlistController.addToWishlist);
router.post('/wishlist/add-to-cart', userAuth, wishlistController.addToCartfromwishlist);
router.post('/wishlist/remove', userAuth, wishlistController.removeFromWishlist);

// Cart
router.get('/cart', userAuth, cartController.getCart);
router.post('/add-to-cart', userAuth, cartController.addToCart);
router.post('/add-to-cart-shop/:productId', userAuth, cartController.shopaddToCart);
router.post('/cart/remove/:productId', userAuth, cartController.removeFromCart);
router.post('/user/cart/update', userAuth, cartController.updateCartQuantity);
router.get('/cart/total', userAuth, orderController.getCartTotal); // Added route for cart total

// Address
router.get('/addresses', userAuth, addressController.loadAddressPage);
router.post('/add-address', userAuth, addressController.addAddress);
router.post('/delete-address/:id', userAuth, addressController.deleteAddress);
router.post('/edit-address/:id', userAuth, addressController.updateAddress);
router.post('/set-primary-address/:id', userAuth, addressController.setPrimaryAddress);
router.get('/primary-address', userAuth, addressController.getPrimaryAddress);

// Shop (public)
router.get('/shop', userController.loadshop);
router.get('/productDetails', userController.productDetails);

// Orders & Checkout
router.get('/checkout', userAuth, orderController.loadcheckout);
router.post('/add-address-checkout', userAuth, orderController.newaddress);
router.post('/edit-address-checkout/:id', userAuth, orderController.editAddressCheckout);
router.post('/apply-coupon', userAuth, orderController.applyCoupon); 
router.post('/remove-coupon', userAuth, orderController.removeCoupon); 


// router.post('/refresh-session', userAuth, (req, res) => {
//     try {
//         req.session.appliedCoupon = null; // Clear applied coupon
//         // Optionally reinitialize cart or other session data if needed
//         res.status(200).json({ success: true, message: 'Session refreshed' });
//     } catch (error) {
//         console.error('Session refresh error:', error);
//         res.status(500).json({ success: false, message: 'Failed to refresh session' });
//     }
// });

router.post('/place-order', userAuth, formParser.none(), orderController.placeorder);
router.post("/razorpay/create-order", formParser.none(), orderController.createRazorpay);
router.get('/order-failed/:orderId', userAuth, orderController.loadOrderFailed);
router.get('/order-confirmation/:orderId', userAuth, orderController.getOrderConfirmation);
router.get('/orders', userAuth, orderController.getOrders);
router.get('/order-details/:orderId', userAuth, orderController.getOrderDetails);
router.post('/cancel-order', userAuth, orderController.cancelOrder);
router.post('/cancel-all-orders', userAuth, orderController.cancelAllOrders);
router.post('/return-order', userAuth, orderController.returnOrder);
router.get('/download-invoice', userAuth, orderController.generateInvoice);
router.get('/checkout/retry-order/:orderId', userAuth, orderController.retryOrderCheckout);
router.get('/get-wallet-balance', orderController.getWalletBalance);

// // New route for wallet balance
// router.get('/wallet/balance', userAuth, orderController.getWalletBalance);


// Wallet
router.get('/wallet', userAuth, walletController.loadWallet);

// router.get('/wallet', userAuth, walletController.addRefundToWallet);


// Orders & Checkout
// router.get('/checkout', userAuth, orderController.loadcheckout);
// router.post('/add-address-checkout', userAuth, orderController.newaddress);
// router.post('/edit-address-checkout/:id', userAuth, orderController.editAddressCheckout);
// router.post('/apply-coupon', userAuth, orderController.applyCoupon); 
// router.post('/remove-coupon', userAuth, orderController.removeCoupon); 

// router.post('/place-order', userAuth, formParser.none(), orderController.placeorder);
// router.post('/create-razorpay-order', userAuth, formParser.none(), orderController.createRazorpay); // Updated path to match EJS
// router.get('/order-failed/:orderId', userAuth, orderController.loadOrderFailed);
// router.get('/order-confirmation/:orderId', userAuth, orderController.getOrderConfirmation);
// router.get('/orders', userAuth, orderController.getOrders);
// router.get('/order-details/:orderId', userAuth, orderController.getOrderDetails);
// router.post('/cancel-order', userAuth, orderController.cancelOrder);
// router.post('/cancel-all-orders', userAuth, orderController.cancelAllOrders);
// router.post('/return-order', userAuth, orderController.returnOrder);
// router.get('/download-invoice', userAuth, orderController.generateInvoice);
// router.get('/checkout/retry-order/:orderId', userAuth, orderController.retryOrderCheckout);
// router.get('/get-wallet-balance', orderController.getWalletBalance);




module.exports = router;
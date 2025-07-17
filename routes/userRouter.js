
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
const couponController = require('../controllers/user/couponController');

const { userAuth } = require('../middlewares/auth');
const {ProfileUpload} = require('../middlewares/multer')




// const { storage } = require('../utils/cloudinary');
// const upload = multer({ storage });






//  Multer Config 
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'public/uploads/profile/');
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//     cb(null, `profile-${uniqueSuffix}${path.extname(file.originalname)}`);
//   }
// });
// const fileFilter = (req, file, cb) => {
//   const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
//   cb(null, allowedTypes.includes(file.mimetype));
// };
// const upload = multer({
//   storage,
//   limits: { fileSize: 1 * 1024 * 1024 }, 
//   fileFilter
// });

//  Public routes
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

// Password Reset 
router.get('/forgot-password', profileController.getForgotPassPage);
router.post('/forgot-email-valid', profileController.forgotEmailValid);
router.post('/verify-passForgot-otp', profileController.verifyForgotPassOtp);
router.get('/reset-password', profileController.getResetPassPage);
router.post('/resend-forgot-otp', profileController.resendOtp);
router.post('/reset-password', profileController.postNewPassword);

// Profile
router.get('/userProfile', userAuth, profileController.userProfile);

// Edit Profile
router.get('/edit-profile', userAuth, editController.renderEditProfile);
router.post('/update-profile', userAuth, editController.updateProfile);
router.post('/upload-profile-photo', userAuth, ProfileUpload.single('profilePhoto'), profileController.uploadProfilePhoto);

router.post('/send-otp', userAuth, editController.sendOtp);
router.post('/editprofile/resendotp', userAuth, editController.resendOtp);

router.post('/edit/verify-otp', userAuth, editController.verifyOtp);
router.post('/confirm-new/email', userAuth, editController.newMailConfirmation); 
router.post('/send-otp-new-email', userAuth, editController.sendOtpForNewEmail);
router.post('/editprofile/editresendOtp', userAuth, editController.editresendOtp);


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
router.post('/add-to-cart', cartController.addToCart);
router.post('/add-to-cart-shop/:productId', cartController.shopaddToCart);
router.post('/cart/remove/:productId', userAuth, cartController.removeFromCart);
router.post('/user/cart/update', userAuth, cartController.updateCartQuantity);
router.get('/cart/total', userAuth, orderController.getCartTotal); 


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
router.get('/shop/data', userController.getShopData);
router.get('/productDetails/data', userController.getProductDetailsData);
router.get('/check-session', userController.checkSession);

router.get('/about',userController.getaboutPage)
router.get('/contact',userController.getContactPage)

  // Orders & Checkout
  router.get('/checkout', userAuth, orderController.loadCheckout);
  router.post('/add-address-checkout', userAuth, orderController.newaddress);
  router.post('/edit-address-checkout/:id', userAuth, orderController.editAddressCheckout);



  router.post('/apply-coupon', userAuth, orderController.applyCoupon); 
  router.post('/remove-coupon', userAuth, orderController.removeCoupon); 

  //   router.post('/apply-coupon', userAuth, couponController.applyCoupon); 
  // router.post('/remove-coupon', userAuth, couponController.clearCoupon); 




router.post('/place-order', userAuth, formParser.none(), orderController.placeorder);

router.post('/checkquantity', userAuth, orderController.checkQuantity);

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




// Wallet
router.get('/wallet', userAuth, walletController.loadWallet);





module.exports = router;
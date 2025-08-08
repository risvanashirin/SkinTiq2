const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const salesController = require('../controllers/admin/salesController');
const brandController = require('../controllers/admin/brandController');
const { userAuth, adminAuth } = require('../middlewares/auth');
const { productUpload} = require('../helpers/multer');



const {brandUpload} = require('../middlewares/multer')



// Error Page
router.get('/pageerror', adminController.pageerror);

// Login management
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/logout', adminAuth, adminController.logout);

// Dashboard 
router.get('/', adminAuth, adminController.loadDashboard);
router.get('/api/chart-data', adminAuth, adminController.getChartData);
router.get('/api/ledger', adminAuth, adminController.generateLedger);

// Customer management

router.get('/users', adminAuth, customerController.customerInfo);
router.post('/blockCustomer', adminAuth, customerController.customerBlocked);
router.post('/unblockCustomer', adminAuth, customerController.customerunBlocked);


// Category management
router.get('/category', adminAuth, categoryController.categoryInfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);
router.put('/editCategory/:id', adminAuth, categoryController.editCategory);
router.post('/addCategoryOffer', adminAuth, categoryController.addCategoryOffer);
router.put('/editCategoryOffer', adminAuth, categoryController.editCategoryOffer);
router.delete('/removeCategoryOffer', adminAuth, categoryController.removeCategoryOffer);
router.post('/listCategory', adminAuth, categoryController.getListCategory);
router.post('/unListCategory', adminAuth, categoryController.getUnlistCategory);

// Product management
router.get('/addProducts', adminAuth, productController.getProductAddPage);
router.post('/addProducts', adminAuth, productUpload.array('images', 8), productController.addProducts);
router.post('/addProductOffer', adminAuth, productController.addProductOffer);
router.put('/editProductOffer', adminAuth, productController.editProductOffer);
router.delete('/removeProductOffer', adminAuth, productController.removeProductOffer);
router.get('/products', adminAuth, productController.getAllProducts);
router.get('/blockProduct', adminAuth, productController.blockProduct);
router.get('/unblockProduct', adminAuth, productController.unblockProduct);
router.get('/editProducts', adminAuth, productController.geteditProduct);
router.post('/editProduct/:id', productUpload.array('images', 8), productController.updateProduct);
router.delete('/deleteImage', adminAuth, productController.deleteSingleImage);

// Order management
router.get('/order', adminAuth, orderController.getOrders);
router.get('/order/:id', adminAuth, orderController.getOrderDetails);
router.put('/order/update-status', adminAuth, orderController.updateOrderStatus);
router.post('/order/cancel', adminAuth, orderController.cancelOrder);
router.post('/order/return', adminAuth, orderController.handleReturnRequest);

// Coupon management
router.get('/coupon', adminAuth, couponController.getCoupons);
router.post('/coupon/add', adminAuth, couponController.addCoupon);
router.put('/coupon/edit/:id', adminAuth, couponController.editCoupon);
router.post('/coupon/toggle/:id', adminAuth, couponController.toggleCouponStatus);
router.delete('/coupon/delete/:id', adminAuth, couponController.deleteCoupon);

// Sales report page
router.get('/sales', adminAuth, salesController.renderSalesReport);
router.post('/sales', adminAuth, salesController.renderSalesReport);

// API endpoint for sales report data
router.post('/api/sales-report', adminAuth, salesController.getSalesReport);

// Brand management
router.get('/brand', adminAuth, brandController.loadBrandPage);
router.post('/addBrand', adminAuth, brandUpload.single('brandImage'), brandController.addBrand);
router.put('/editBrand/:id', adminAuth, brandUpload.single('brandImage'), brandController.editBrand);
router.post('/unlistBrand', adminAuth, brandController.unlistBrand);
router.post('/listBrand', adminAuth, brandController.listBrand);

module.exports = router;
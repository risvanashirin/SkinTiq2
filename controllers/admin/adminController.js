

// const User = require('../../models/userSchema')
// const Order = require('../../models/orderSchema');
// const Product = require('../../models/productSchema');
// const Category = require('../../models/categorySchema');
// const Brand = require('../../models/brandSchema');
// const mongoose = require('mongoose');
// const bcrypt = require('bcrypt');
// const PDFDocument = require('pdfkit');
// const moment = require('moment');

// const pageerror = async (req, res) => {
//   res.render('admin-error');
// };

// const loadLogin = (req, res) => {
//   if (req.session.admin) {
//     return res.redirect('/admin');
//   }
//   res.render('admin-login', { message: null });
// };

// const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const admin = await User.findOne({ email, isAdmin: true });
//     if (admin && await bcrypt.compare(password, admin.password)) {
//       req.session.admin = admin._id;
//       return res.redirect('/admin');
//     }
//     return res.redirect('/admin/login');
//   } catch (error) {
//     console.error('/login error', error);
//     return res.redirect('/pageerror');
//   }
// };

// const logout = async (req, res) => {
//   try {
//     req.session.admin = null;
//     req.session.destroy(err => {
//       if (err) {
//         console.error('Error destroying session', err);
//         return res.redirect('/pageerror');
//       }
//       res.redirect('/admin/login');
//     });
//   } catch (error) {
//     console.error('Unexpected error during logout', error);
//     res.redirect('/pageerror');
//   }
// };

// const loadDashboard = async (req, res) => {
//   try {
//     const admin = await User.findById(req.session.admin);
//     if (!admin || !admin.isAdmin) {
//       return res.redirect('/admin/login');
//     }

//     const reportType = req.query.reportType || 'monthly';
//     let startDate, endDate;
//     if (reportType === 'custom') {
//       startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
//       endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
//     } else {
//       endDate = new Date();
//       startDate = new Date();
//       if (reportType === 'daily') startDate.setDate(endDate.getDate() - 30);
//       else if (reportType === 'weekly') startDate.setMonth(endDate.getMonth() - 3);
//       else if (reportType === 'monthly') startDate.setFullYear(endDate.getFullYear() - 1);
//       else if (reportType === 'yearly') startDate.setFullYear(endDate.getFullYear() - 5);
//     }

//     const topProducts = await Order.aggregate([
//       { $match: { invoiceDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
//       { $group: { _id: '$product', totalSold: { $sum: '$quantity' }, revenue: { $sum: '$finalAmount' } } },
//       { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
//       { $unwind: '$product' },
//       { $project: { productName: '$product.productName', totalSold: 1, revenue: 1 } },
//       { $sort: { revenue: -1 } },
//       { $limit: 10 }
//     ]);

//     const topCategories = await Order.aggregate([
//       { $match: { invoiceDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
//       { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
//       { $unwind: '$product' },
//       { $group: { _id: '$product.category', totalSold: { $sum: '$quantity' }, revenue: { $sum: '$finalAmount' } } },
//       { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
//       { $unwind: '$category' },
//       { $project: { name: '$category.name', totalSold: 1, revenue: 1 } },
//       { $sort: { revenue: -1 } },
//       { $limit: 10 }
//     ]);

//     const topBrands = await Order.aggregate([
//       { $match: { invoiceDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
//       { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
//       { $unwind: '$product' },
//       { $group: { _id: '$product.brand', totalSold: { $sum: '$quantity' }, revenue: { $sum: '$finalAmount' } } },
//       { $lookup: { from: 'brands', localField: '_id', foreignField: '_id', as: 'brand' } },
//       { $unwind: '$brand' },
//       { $project: { brandName: '$brand.brandName', totalSold: 1, revenue: 1 } },
//       { $sort: { revenue: -1 } },
//       { $limit: 10 }
//     ]);

//     res.render('dashboard', {
//       reportType,
//       startDate: startDate ? startDate.toISOString().split('T')[0] : '',
//       endDate: endDate ? endDate.toISOString().split('T')[0] : '',
//       topProducts,
//       topCategories,
//       topBrands
//     });
//   } catch (error) {
//     console.error('Error loading dashboard:', error);
//     res.redirect('/pageerror');
//   }
// };

// const getChartData = async (req, res) => {
//   try {
//     const reportType = req.query.reportType || 'monthly';
//     let startDate = new Date();
//     let endDate = new Date();
//     endDate.setHours(23, 59, 59, 999);
//     if (reportType === 'custom') {
//       startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
//       endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
//       endDate.setHours(23, 59, 59, 999);
//       if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
//         console.error('Invalid custom dates:', req.query.startDate, req.query.endDate);
//         return res.status(400).json({ error: 'Invalid date format' });
//       }
//     } else {
//       if (reportType === 'daily') startDate.setDate(endDate.getDate() - 30);
//       else if (reportType === 'weekly') startDate.setMonth(endDate.getMonth() - 3);
//       else if (reportType === 'monthly') startDate.setFullYear(endDate.getFullYear() - 1);
//       else if (reportType === 'yearly') startDate.setFullYear(endDate.getFullYear() - 5);
//       startDate.setHours(0, 0, 0, 0);
//     }

//     // Validate dates
//     if (startDate > endDate) {
//       console.error('Start date after end date:', startDate, endDate);
//       return res.status(400).json({ error: 'Start date cannot be after end date' });
//     }

//     const format = reportType === 'yearly' ? '%Y' : reportType === 'monthly' ? '%Y-%m' : reportType === 'weekly' ? '%Y-W%U' : '%Y-%m-%d';
//     const sales = await Order.aggregate([
//       { $match: { invoiceDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
//       { $group: { _id: { $dateToString: { format, date: '$invoiceDate' } }, total: { $sum: '$finalAmount' } } },
//       { $sort: { '_id': 1 } }
//     ]);

//     const labels = sales.map(s => s._id);
//     const values = sales.map(s => s.total || 0);
//     if (labels.length === 0) {
//       console.warn('No sales data for period:', startDate, endDate);
//       return res.json({ labels: [], values: [] });
//     }
//     res.json({ labels, values });
//   } catch (error) {
//     console.error('getChartData error:', error.message, error.stack);
//     res.status(500).json({ error: error.message || 'Failed to fetch chart data' });
//   }
// };

// const generateLedger = async (req, res) => {
//   try {
//     const reportType = req.query.reportType || 'monthly';
//     const format = req.query.format || 'pdf';
//     let startDate = new Date();
//     let endDate = new Date();
//     endDate.setHours(23, 59, 59, 999);
//     if (reportType === 'custom') {
//       startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
//       endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
//       endDate.setHours(23, 59, 59, 999);
//       if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
//         console.error('Invalid ledger dates:', req.query.startDate, req.query.endDate);
//         return res.status(400).json({ error: 'Invalid date format' });
//       }
//     } else {
//       if (reportType === 'daily') startDate.setDate(endDate.getDate() - 30);
//       else if (reportType === 'weekly') startDate.setMonth(endDate.getMonth() - 3);
//       else if (reportType === 'monthly') startDate.setFullYear(endDate.getFullYear() - 1);
//       else if (reportType === 'yearly') startDate.setFullYear(endDate.getFullYear() - 5);
//       startDate.setHours(0, 0, 0, 0);
//     }

//     const orders = await Order.find({
//       invoiceDate: { $gte: startDate, $lte: endDate },
//       status: { $ne: 'cancelled' }
//     }).populate('product').sort({ invoiceDate: -1 }); // Sort by date descending

//     if (format === 'json') {
//       return res.json(orders);
//     } else if (format === 'pdf') {
//       const doc = new PDFDocument();
//       res.setHeader('Content-Type', 'application/pdf');
//       res.setHeader('Content-Disposition', 'attachment; filename=ledger_book.pdf');
//       doc.pipe(res);
//       doc.fontSize(20).text('Ledger Book', { align: 'center' });
//       doc.moveDown();
//       doc.fontSize(12).text(`Period: ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`);
//       doc.moveDown();
//       doc.fontSize(10);
//       doc.text('Date', 50, 100);
//       doc.text('Order ID', 150, 100);
//       doc.text('Product', 250, 100);
//       doc.text('Amount', 350, 100);
//       doc.text('Discount', 450, 100);
//       let y = 120;
//       orders.forEach(order => {
//         doc.text(moment(order.invoiceDate).format('YYYY-MM-DD'), 50, y);
//         doc.text(order.orderId.slice(-12), 150, y);
//         doc.text(order.product?.productName || 'Unknown', 250, y);
//         doc.text(`₹${order.finalAmount.toLocaleString()}`, 350, y);
//         doc.text(`₹${order.discount.toLocaleString()}`, 450, y);
//         y += 20;
//       });
//       doc.end();
//     } else {
//       res.status(400).json({ error: 'Invalid format' });
//     }
//   } catch (error) {
//     console.error('generateLedger error:', error.message, error.stack);
//     res.status(500).json({ error: error.message || 'Failed to generate ledger' });
//   }
// };

// module.exports = {
//   loadLogin,
//   login,
//   loadDashboard,
//   pageerror,
//   logout,
//   getChartData,
//   generateLedger
// };



const User = require('../../models/userSchema')
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const PDFDocument = require('pdfkit');
const moment = require('moment');

const pageerror = async (req, res) => {
  res.render('admin-error');
};

const loadLogin = (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }
  res.render('admin-login', { message: null });
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });
    if (admin && await bcrypt.compare(password, admin.password)) {
      req.session.admin = admin._id;
      return res.redirect('/admin');
    }
    return res.redirect('/admin/login');
  } catch (error) {
    console.error('/login error', error);
    return res.redirect('/pageerror');
  }
};

const logout = async (req, res) => {
  try {
    req.session.admin = null;
    req.session.destroy(err => {
      if (err) {
        console.error('Error destroying session', err);
        return res.redirect('/pageerror');
      }
      res.redirect('/admin/login');
    });
  } catch (error) {
    console.error('Unexpected error during logout', error);
    res.redirect('/pageerror');
  }
};

const loadDashboard = async (req, res) => {
  try {
    const admin = await User.findById(req.session.admin);
    if (!admin || !admin.isAdmin) {
      return res.redirect('/admin/login');
    }

    const reportType = req.query.reportType || 'monthly';
    let startDate, endDate;
    if (reportType === 'custom') {
      startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
      endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    } else {
      endDate = new Date();
      startDate = new Date();
      if (reportType === 'daily') startDate.setDate(endDate.getDate() - 30);
      else if (reportType === 'weekly') startDate.setMonth(endDate.getMonth() - 3);
      else if (reportType === 'monthly') startDate.setFullYear(endDate.getFullYear() - 1);
      else if (reportType === 'yearly') startDate.setFullYear(endDate.getFullYear() - 5);
    }

    const topProducts = await Order.aggregate([
      { $match: { invoiceDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
      { $group: { _id: '$product', totalSold: { $sum: '$quantity' }, revenue: { $sum: '$finalAmount' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { productName: '$product.productName', totalSold: 1, revenue: { $round: ['$revenue', 0] } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);

    const topCategories = await Order.aggregate([
      { $match: { invoiceDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $group: { _id: '$product.category', totalSold: { $sum: '$quantity' }, revenue: { $sum: '$finalAmount' } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      { $project: { name: '$category.name', totalSold: 1, revenue: { $round: ['$revenue', 0] } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);

    const topBrands = await Order.aggregate([
      { $match: { invoiceDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $group: { _id: '$product.brand', totalSold: { $sum: '$quantity' }, revenue: { $sum: '$finalAmount' } } },
      { $lookup: { from: 'brands', localField: '_id', foreignField: '_id', as: 'brand' } },
      { $unwind: '$brand' },
      { $project: { brandName: '$brand.brandName', totalSold: 1, revenue: { $round: ['$revenue', 0] } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);

    res.render('dashboard', {
      reportType,
      startDate: startDate ? startDate.toISOString().split('T')[0] : '',
      endDate: endDate ? endDate.toISOString().split('T')[0] : '',
      topProducts,
      topCategories,
      topBrands
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.redirect('/pageerror');
  }
};

const getChartData = async (req, res) => {
  try {
    const reportType = req.query.reportType || 'monthly';
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    if (reportType === 'custom') {
      startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
      endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
      endDate.setHours(23, 59, 59, 999);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error('Invalid custom dates:', req.query.startDate, req.query.endDate);
        return res.status(400).json({ error: 'Invalid date format' });
      }
    } else {
      if (reportType === 'daily') startDate.setDate(endDate.getDate() - 30);
      else if (reportType === 'weekly') startDate.setMonth(endDate.getMonth() - 3);
      else if (reportType === 'monthly') startDate.setFullYear(endDate.getFullYear() - 1);
      else if (reportType === 'yearly') startDate.setFullYear(endDate.getFullYear() - 5);
      startDate.setHours(0, 0, 0, 0);
    }

    // Validate dates
    if (startDate > endDate) {
      console.error('Start date after end date:', startDate, endDate);
      return res.status(400).json({ error: 'Start date cannot be after end date' });
    }

    const format = reportType === 'yearly' ? '%Y' : reportType === 'monthly' ? '%Y-%m' : reportType === 'weekly' ? '%Y-W%U' : '%Y-%m-%d';
    const sales = await Order.aggregate([
      { $match: { invoiceDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
      { $group: { _id: { $dateToString: { format, date: '$invoiceDate' } }, total: { $sum: '$finalAmount' } } },
      { $sort: { '_id': 1 } }
    ]);

    const labels = sales.map(s => s._id);
    const values = sales.map(s => Math.round(s.total || 0));
    if (labels.length === 0) {
      console.warn('No sales data for period:', startDate, endDate);
      return res.json({ labels: [], values: [] });
    }
    res.json({ labels, values });
  } catch (error) {
    console.error('getChartData error:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Failed to fetch chart data' });
  }
};

const generateLedger = async (req, res) => {
  try {
    const reportType = req.query.reportType || 'monthly';
    const format = req.query.format || 'pdf';
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    if (reportType === 'custom') {
      startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
      endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
      endDate.setHours(23, 59, 59, 999);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error('Invalid ledger dates:', req.query.startDate, req.query.endDate);
        return res.status(400).json({ error: 'Invalid date format' });
      }
    } else {
      if (reportType === 'daily') startDate.setDate(endDate.getDate() - 30);
      else if (reportType === 'weekly') startDate.setMonth(endDate.getMonth() - 3);
      else if (reportType === 'monthly') startDate.setFullYear(endDate.getFullYear() - 1);
      else if (reportType === 'yearly') startDate.setFullYear(endDate.getFullYear() - 5);
      startDate.setHours(0, 0, 0, 0);
    }

    const orders = await Order.find({
      invoiceDate: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' }
    }).populate('product').sort({ invoiceDate: -1 });

    if (format === 'json') {
      return res.json(orders.map(order => ({
        ...order._doc,
        finalAmount: Math.round(order.finalAmount || 0),
        discount: Math.round(order.discount || 0)
      })));
    } else if (format === 'pdf') {
      const doc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=ledger_book.pdf');
      doc.pipe(res);
      doc.fontSize(20).text('Ledger Book', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Period: ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`);
      doc.moveDown();
      doc.fontSize(10);
      doc.text('Date', 50, 100);
      doc.text('Order ID', 150, 100);
      doc.text('Product', 250, 100);
      doc.text('Amount', 350, 100);
      doc.text('Discount', 450, 100);
      let y = 120;
      orders.forEach(order => {
        doc.text(moment(order.invoiceDate).format('YYYY-MM-DD'), 50, y);
        doc.text(order.orderId.slice(-12), 150, y);
        doc.text(order.product?.productName || 'Unknown', 250, y);
        doc.text(`₹${Math.round(order.finalAmount).toLocaleString()}`, 350, y);
        doc.text(`₹${Math.round(order.discount).toLocaleString()}`, 450, y);
        y += 20;
      });
      doc.end();
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (error) {
    console.error('generateLedger error:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Failed to generate ledger' });
  }
};

module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageerror,
  logout,
  getChartData,
  generateLedger
};
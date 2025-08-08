const User = require('../../models/userSchema')
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const STATUS_CODES = require('../../helpers/statusCodes');
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
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB is not connected');
    }
    const admin = await User.findById(req.session.admin);
    if (!admin || !admin.isAdmin) {
      return res.redirect('/admin/login');
    }

    const reportType = req.query.reportType || 'daily';
    console.log("req.query.reportType:", req.query.reportType, "reportType:", reportType);

    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (reportType === 'custom') {
      startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
      endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (reportType === 'daily') {
      startDate.setDate(endDate.getDate() - 30);
    } else if (reportType === 'weekly') {
      startDate.setMonth(endDate.getMonth() - 3);
    } else if (reportType === 'monthly') {
      startDate.setFullYear(endDate.getFullYear() - 1);
    } else if (reportType === 'yearly') {
      startDate.setFullYear(endDate.getFullYear() - 5);
    }
    startDate.setHours(0, 0, 0, 0);

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
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
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
    const reportType = req.query.reportType || 'daily';
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

    if (startDate > endDate) {
      console.error('Start date after end date:', startDate, endDate);
      return res.status(400).json({ error: 'Start date cannot be after end date' });
    }

    const format = reportType === 'yearly' ? '%Y' : reportType === 'monthly' ? '%Y-%m' : reportType === 'weekly' ? '%Y-W%U' : '%Y-%m-%d';
    let sales = [];
    let retries = 3;
    while (retries > 0) {
      try {
        sales = await Order.aggregate([
          { $match: { invoiceDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
          { $group: { _id: { $dateToString: { format, date: '$invoiceDate' } }, total: { $sum: '$finalAmount' } } },
          { $sort: { '_id': 1 } }
        ]);
        break;
      } catch (error) {
        retries -= 1;
        if (retries === 0) throw error;
        console.warn(`Retrying chart data fetch (${retries} attempts left)...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const labels = [];
    const values = [];
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = reportType === 'yearly'
        ? currentDate.getFullYear().toString()
        : reportType === 'monthly'
        ? `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`
        : reportType === 'weekly'
        ? `${currentDate.getFullYear()}-W${Math.ceil((currentDate.getDate() + (currentDate.getDay() || 7)) / 7)}`
        : currentDate.toISOString().split('T')[0];
      labels.push(dateStr);
      const sale = sales.find(s => s._id === dateStr);
      values.push(sale ? Math.round(sale.total) : 0);

      if (reportType === 'yearly') currentDate.setFullYear(currentDate.getFullYear() + 1);
      else if (reportType === 'monthly') currentDate.setMonth(currentDate.getMonth() + 1);
      else if (reportType === 'weekly') currentDate.setDate(currentDate.getDate() + 7);
      else currentDate.setDate(currentDate.getDate() + 1);
    }

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    if (reportType === 'custom') {
      startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
      endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
      endDate.setHours(23, 59, 59, 999);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error('Invalid ledger dates:', req.query.startDate, req.query.endDate);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ error: 'Invalid date format' });
      }
    } else {
      if (reportType === 'daily') startDate.setDate(endDate.getDate() - 30);
      else if (reportType === 'weekly') startDate.setMonth(endDate.getMonth() - 3);
      else if (reportType === 'monthly') startDate.setFullYear(endDate.getFullYear() - 1);
      else if (reportType === 'yearly') startDate.setFullYear(endDate.getFullYear() - 5);
      startDate.setHours(0, 0, 0, 0);
    }

    const query = {
      invoiceDate: { $gte: startDate, $lte: endDate },
      // Removed status: { $ne: 'cancelled' } to include cancelled orders
    };

    if (format === 'json') {
      const totalOrders = await Order.countDocuments(query);
      const totalPages = Math.ceil(totalOrders / limit);

      const orders = await Order.find(query)
        .populate('product')
        .populate('userId', 'name')
        .sort({ invoiceDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      return res.json({
        orders: orders.map(order => {
          const subtotal = Math.round((order.price * order.quantity) || 0);
          const charges = Math.round((order.finalAmount - ((order.price * order.quantity) - order.discount)) || 0);
          let type;
          if (order.status === 'cancelled') {
            type = 'Cancelled';
          } else if (['returned', 'return request'].includes(order.status)) {
            type = 'Return';
          } else {
            type = 'Order';
          }
          const creditDebit = type === 'Return' || type === 'Cancelled' ? 'Debit' : 'Credit';

const profit = type === 'Return' || type === 'Cancelled'
  ? 0
  : Math.round((order.finalAmount - (order.price * order.quantity * 0.7)) || 0);


          return {
            ...order._doc,
            customerName: order.userId?.name || 'Unknown',
            subtotal,
            charges,
            type,
            creditDebit,
            profit,
            finalAmount: Math.round(order.finalAmount || 0),
            discount: Math.round(order.discount || 0)
          };
        }),
        pagination: {
          currentPage: page,
          totalPages,
          totalOrders,
          limit
        }
      });
    } else if (format === 'pdf') {
      const allOrders = await Order.find(query)
        .populate('product')
        .populate('userId', 'name')
        .sort({ invoiceDate: -1 });

      const doc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=ledger_book.pdf');
      doc.pipe(res);
      doc.fontSize(20).text('Ledger Book', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Period: ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`);
      doc.moveDown();
      doc.fontSize(10);
      let y = 120;

      const headers = ['Date', 'Order ID', 'Customer', 'Product', 'Subtotal', 'Discount', 'Charges', 'Amount', 'Type', 'Cr/Dr', 'Profit'];
      let xPositions = [30, 90, 150, 230, 310, 360, 410, 460, 510, 550, 590];
      headers.forEach((header, i) => {
        doc.text(header, xPositions[i], 100);
      });

      allOrders.forEach((order, index) => {
        if (y > 700) {
          doc.addPage();
          y = 100;
          headers.forEach((header, i) => {
            doc.text(header, xPositions[i], y - 20);
          });
          y = 120;
        }

        const subtotal = Math.round((order.price * order.quantity) || 0);
        const charges = Math.round((order.finalAmount - ((order.price * order.quantity) - order.discount)) || 0);
        let type;
        if (order.status === 'cancelled') {
          type = 'Cancelled';
        } else if (['returned', 'return request'].includes(order.status)) {
          type = 'Return';
        } else {
          type = 'Order';
        }
        const creditDebit = type === 'Return' || type === 'Cancelled' ? 'Debit' : 'Credit';
      const profit = type === 'Return' || type === 'Cancelled'
  ? 0
  : Math.round((order.finalAmount - (order.price * order.quantity * 0.7)) || 0);

        doc.text(moment(order.invoiceDate).format('YYYY-MM-DD'), xPositions[0], y);
        doc.text(order.orderId.slice(-12), xPositions[1], y);
        doc.text(order.userId?.name || 'Unknown', xPositions[2], y, { width: 70, ellipsis: true });
        doc.text(order.product?.productName || 'Unknown', xPositions[3], y, { width: 70, ellipsis: true });
        doc.text(`₹${subtotal.toLocaleString()}`, xPositions[4], y);
        doc.text(`₹${Math.round(order.discount).toLocaleString()}`, xPositions[5], y);
        doc.text(`₹${charges.toLocaleString()}`, xPositions[6], y);
        doc.text(`₹${Math.round(order.finalAmount).toLocaleString()}`, xPositions[7], y);
        doc.text(type, xPositions[8], y);
        doc.text(creditDebit, xPositions[9], y);
        doc.text(`₹${profit.toLocaleString()}`, xPositions[10], y);
        y += 20;
      });

      doc.end();
    } else {
      res.status(STATUS_CODES.BAD_REQUEST).json({ error: 'Invalid format' });
    }
  } catch (error) {
    console.error('generateLedger error:', error.message, error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: error.message || 'Failed to generate ledger' });
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
const mongoose = require('mongoose');
const Sale = require("../../models/salesSchema");
const Order = require("../../models/orderSchema");
const STATUS_CODES = require('../../helpers/statusCodes');

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const renderSalesReport = async (req, res) => {
  try {
    const { reportType, startDate, endDate, format, page = 1, limit = 5 } = req.query;

    // Validate inputs
    const currentPage = parseInt(page) || 1;
    const itemsPerPage = parseInt(limit) || 5;
    if (currentPage < 1 || itemsPerPage < 1) {
      return res.status(STATUS_CODES .BAD_REQUEST).render('admin/pageerror', {
        message: 'Invalid pagination parameters',
        error: 'Page and limit must be positive integers'
      });
    }

    // Build query
    let query = {};
    const now = new Date();
    switch (reportType) {
      case 'daily':
        query.date = {
          $gte: new Date(now.setHours(0, 0, 0, 0)),
          $lte: new Date(now.setHours(23, 59, 59, 999))
        };
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        query.date = {
          $gte: new Date(weekStart.setHours(0, 0, 0, 0)),
          $lte: new Date(weekEnd.setHours(23, 59, 59, 999))
        };
        break;
      case 'monthly':
        query.date = {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
        break;
      case 'custom':
        if (!startDate || !endDate || isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) {
          return res.status(STATUS_CODES .BAD_REQUEST).render('admin/pageerror', {
            message: 'Invalid date range',
            error: 'Please provide valid start and end dates'
          });
        }
        query.date = {
          $gte: new Date(startDate),
          $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
        };
        break;
      default:
        query.date = { $lte: now };
    }

    // Fetch delivered orders
    const deliveredOrders = await Order.find({ status: 'delivered' }).select('_id');
    const orderIds = deliveredOrders.map(order => order._id);

    // If no delivered orders, return empty report
    if (!orderIds.length) {
      const salesData = {
        sales: [],
        totalSales: 0,
        orderCount: 0,
        discounts: 0,
        coupons: 0,
        chartData: [],
        reportType: reportType || 'all',
        startDate,
        endDate,
        currentPage,
        totalPages: 1,
        limit: itemsPerPage,
        queryParams: buildQueryParams(reportType, startDate, endDate)
      };
      if (format === 'pdf') {
        return generatePDF(res, salesData);
      } else if (format === 'excel') {
        return generateExcel(res, salesData);
      }
      return res.render('sales-report', { salesData, adminName: req.admin?.name || 'Admin' });
    }

    query.orderId = { $in: orderIds };

    // Pagination
    const skip = (currentPage - 1) * itemsPerPage;
    const totalSalesRecords = await Sale.countDocuments(query);
    const totalPages = Math.ceil(totalSalesRecords / itemsPerPage) || 1;

    // Redirect to last page if user lands on an empty page
    if (currentPage > totalPages && totalPages !== 0) {
      const params = new URLSearchParams({
        reportType: reportType || '',
        startDate: startDate || '',
        endDate: endDate || '',
        page: totalPages.toString(),
        limit: itemsPerPage.toString()
      });
      return res.redirect(`/admin/sales?${params.toString()}`);
    }

    const sales = await Sale.find(query)
      .populate({
        path: 'orderId',
        select: 'orderId status'
      })
      .sort({ date: -1 })
      .skip(skip)
      .limit(itemsPerPage);

    // Filter out sales with invalid orderId references
    const validSales = sales.filter(sale => sale.orderId && sale.orderId.orderId);

    const totalSales = Math.round(validSales.reduce((sum, sale) => sum + (sale.amount || 0), 0));
    const totalDiscounts = Math.round(validSales.reduce((sum, sale) => sum + (sale.discount || 0), 0));
    const totalCoupons = Math.round(validSales.reduce((sum, sale) => sum + (sale.coupon || 0), 0));

    const salesData = {
      sales: validSales.map(sale => ({
        ...sale._doc,
        amount: Math.round(sale.amount || 0),
        discount: Math.round(sale.discount || 0),
        coupon: Math.round(sale.coupon || 0)
      })),
      totalSales,
      orderCount: totalSalesRecords,
      discounts: totalDiscounts,
      coupons: totalCoupons,
      chartData: validSales.map(sale => ({
        date: sale.date.toISOString().split('T')[0],
        amount: Math.round(sale.amount || 0)
      })),
      reportType: reportType || 'all',
      startDate,
      endDate,
      currentPage,
      totalPages,
      limit: itemsPerPage,
      queryParams: buildQueryParams(reportType, startDate, endDate)
    };

    if (format === 'pdf') {
      return generatePDF(res, salesData, query);
    } else if (format === 'excel') {
      return generateExcel(res, salesData, query);
    }

    res.render('sales-report', { salesData, adminName: req.admin?.name || 'Admin' });
  } catch (error) {
    console.error('Error in renderSalesReport:', error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).render('admin/pageerror', {
      message: 'Error loading sales report',
      error: error.message
    });
  }
};

// Helper function to build query parameters
function buildQueryParams(reportType, startDate, endDate) {
  const params = new URLSearchParams();
  if (reportType) params.append('reportType', reportType);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  return params.toString() ? `&${params.toString()}` : '';
}

const getSalesReport = async (req, res) => {
  try {
    const { reportType, startDate, endDate } = req.body;

    let query = {};
    const now = new Date();
    switch (reportType) {
      case 'daily':
        query.date = {
          $gte: new Date(now.setHours(0, 0, 0, 0)),
          $lte: new Date(now.setHours(23, 59, 59, 999))
        };
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        query.date = {
          $gte: new Date(weekStart.setHours(0, 0, 0, 0)),
          $lte: new Date(weekEnd.setHours(23, 59, 59, 999))
        };
        break;
      case 'monthly':
        query.date = {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
        break;
      case 'custom':
        if (!startDate || !endDate || isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) {
          return res.status(STATUS_CODES .BAD_REQUEST).json({
            success: false,
            message: 'Invalid date range'
          });
        }
        query.date = {
          $gte: new Date(startDate),
          $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
        };
        break;
      default:
        query.date = { $lte: now };
    }

    const deliveredOrders = await Order.find({ status: 'delivered' }).select('_id');
    const orderIds = deliveredOrders.map(order => order._id);

    if (!orderIds.length) {
      return res.json({
        success: true,
        salesData: {
          sales: [],
          totalSales: 0,
          orderCount: 0,
          discounts: 0,
          coupons: 0,
          chartData: []
        }
      });
    }

    query.orderId = { $in: orderIds };

    const sales = await Sale.find(query)
      .populate({
        path: 'orderId',
        select: 'orderId'
      })
      .sort({ date: -1 });

    const totalSales = Math.round(sales.reduce((sum, sale) => sum + (sale.amount || 0), 0));
    const totalDiscounts = Math.round(sales.reduce((sum, sale) => sum + (sale.discount || 0), 0));
    const totalCoupons = Math.round(sales.reduce((sum, sale) => sum + (sale.coupon || 0), 0));

    const salesData = {
      sales: sales
        .filter(sale => sale.orderId)
        .map(sale => ({
          orderId: sale.orderId.orderId,
          amount: Math.round(sale.amount || 0),
          discount: Math.round(sale.discount || 0),
          coupon: Math.round(sale.coupon || 0),
          date: sale.date
        })),
      totalSales,
      orderCount: sales.length,
      discounts: totalDiscounts,
      coupons: totalCoupons,
      chartData: sales
        .filter(sale => sale.orderId)
        .map(sale => ({
          date: sale.date.toISOString().split('T')[0],
          amount: Math.round(sale.amount || 0)
        }))
    };

    res.json({ success: true, salesData });
  } catch (error) {
    console.error('Error in getSalesReport:', error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({
      success: false,
      message: `Internal server error: ${error.message}`
    });
  }
};

const generatePDF = async (res, salesData, query) => {
  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

  doc.pipe(res);
  doc.fontSize(20).text('Sales Report', { align: 'center' });
  doc.moveDown();

  doc.fontSize(14).text('Summary');
  doc.fontSize(12)
    .text(`Total Sales: ₹${Math.round(salesData.totalSales || 0).toLocaleString()}`)
    .text(`Total Orders: ${salesData.orderCount || 0}`)
    .text(`Total Discounts & coupon: ₹${Math.round(salesData.discounts || 0).toLocaleString()}`);
  doc.moveDown();

  // Fetch all sales data using the provided query without pagination
  const allSales = await Sale.find(query)
    .populate({
      path: 'orderId',
      select: 'orderId status'
    })
    .sort({ date: -1 });

  const validSales = allSales.filter(sale => sale.orderId && sale.orderId.orderId);

  doc.fontSize(14).text('Detailed Sales');
  const headers = ['Date', 'Order ID', 'Amount', 'Discount'];
  let x = 50, y = doc.y + 20;
  headers.forEach(header => {
    doc.text(header, x, y);
    x += 100;
  });

  y += 20;
  validSales.forEach(sale => {
    // Check if we need a new page
    if (y > 700) {
      doc.addPage();
      y = 50;
      x = 50;
      headers.forEach(header => {
        doc.text(header, x, y);
        x += 100;
      });
      y += 20;
    }
    x = 50;
    doc.text(new Date(sale.date).toLocaleDateString(), x, y);
    x += 100;
    const shortOrderId = sale.orderId.orderId.toString().slice(-12);
    doc.text(shortOrderId, x, y);
    x += 100;
    doc.text(`₹${Math.round(sale.amount || 0).toLocaleString()}`, x, y);
    x += 100;
    doc.text(`₹${Math.round(sale.discount || 0).toLocaleString()}`, x, y);
    y += 20;
  });

  doc.end();
};

const generateExcel = async (res, salesData, query) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');

  // Add summary section
  worksheet.addRow(['Sales Report']).getCell(1).font = { size: 14, bold: true };
  worksheet.addRow(['Summary']).getCell(1).font = { size: 12, bold: true };
  worksheet.addRow(['Total Sales', '', `₹${Math.round(salesData.totalSales || 0).toLocaleString()}`]);
  worksheet.addRow(['Total Orders', '', salesData.orderCount || 0]);
  worksheet.addRow(['Total Discounts & Coupons', '', `₹${Math.round(salesData.discounts || 0).toLocaleString()}`]);
  worksheet.addRow([]);

  // Fetch all sales data using the provided query without pagination
  const allSales = await Sale.find(query)
    .populate({
      path: 'orderId',
      select: 'orderId status'
    })
    .sort({ date: -1 });

  const validSales = allSales.filter(sale => sale.orderId && sale.orderId.orderId);

  // Add detailed sales section with headers
  worksheet.addRow(['Detailed Sales']).getCell(1).font = { size: 12, bold: true };
  worksheet.addRow(['Date', 'Order ID', 'Amount', 'Discount & Coupon']).eachCell(cell => {
    cell.font = { bold: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Add detailed sales data
  validSales.forEach(sale => {
    worksheet.addRow([
      new Date(sale.date).toLocaleDateString(),
      sale.orderId.orderId.toString(),
      `₹${Math.round(sale.amount || 0).toLocaleString()}`,
      `₹${Math.round(sale.discount || 0).toLocaleString()}`
    ]);
  });

  // Set column widths
  worksheet.columns = [
    { key: 'date', width: 15 },
    { key: 'orderId', width: 30 },
    { key: 'amount', width: 15 },
    { key: 'discount', width: 15 }
  ];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
  await workbook.xlsx.write(res);
};

module.exports = {
  renderSalesReport,
  getSalesReport
};
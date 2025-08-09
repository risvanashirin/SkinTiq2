const mongoose = require('mongoose');
const Sale = require("../../models/salesSchema");
const Order = require("../../models/orderSchema");
const STATUS_CODES = require('../../helpers/statusCodes');

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const renderSalesReport = async (req, res) => {
  try {
    const { reportType, startDate, endDate, format, page = 1, limit = 5 } = req.query;

    const currentPage = parseInt(page) || 1;
    const itemsPerPage = parseInt(limit) || 5;
    if (currentPage < 1 || itemsPerPage < 1) {
      return res.status(STATUS_CODES.BAD_REQUEST).render('admin/pageerror', {
        message: 'Invalid pagination parameters',
        error: 'Page and limit must be positive integers'
      });
    }

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
          return res.status(STATUS_CODES.BAD_REQUEST).render('admin/pageerror', {
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

    const deliveredOrders = await Order.find({ status: 'delivered' }).select('_id quantity paymentMethod productName');
    const orderIds = deliveredOrders.map(order => order._id);

    if (!orderIds.length) {
      const salesData = {
        sales: [],
        totalSales: 0,
        orderCount: 0,
        discounts: 0,
        coupons: 0,
        totalCharges: 0,
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
        return generatePDF(res, salesData, query);
      } else if (format === 'excel') {
        return generateExcel(res, salesData, query);
      }
      return res.render('sales-report', { salesData, adminName: req.admin?.name || 'Admin' });
    }

    query.orderId = { $in: orderIds };

    const skip = (currentPage - 1) * itemsPerPage;
    const totalSalesRecords = await Sale.countDocuments(query);
    const totalPages = Math.ceil(totalSalesRecords / itemsPerPage) || 1;

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
        select: 'orderId status quantity paymentMethod productName'
      })
      .sort({ date: -1 })
      .skip(skip)
      .limit(itemsPerPage);

    const validSales = sales.filter(sale => sale.orderId && sale.orderId.orderId);
    const totalSales = Math.round(validSales.reduce((sum, sale) => sum + (sale.finalAmount || 0), 0));
    const totalDiscounts = Math.round(validSales.reduce((sum, sale) => sum + (sale.discount || 0), 0));
    const totalCoupons = Math.round(validSales.reduce((sum, sale) => sum + (sale.couponDiscount || 0), 0));
    const totalCharges = Math.round(validSales.reduce((sum, sale) => sum + (sale.gst || 0) + (sale.shipping || 0), 0));


    const splquwery = await Order.find({
      status: "delivered",
      deliveredOn: query.date
    })

    console.log("splquwery:", splquwery)

    const spltotalSales = Math.round(splquwery.reduce((sum, sale) => sum + (sale.finalAmount || 0), 0));
    const spltotalDiscounts = Math.round(splquwery.reduce((sum, sale) => sum + (sale.discount || 0), 0));
    const spltotalCoupons = Math.round(splquwery.reduce((sum, sale) => sum + (sale.couponDiscount || 0), 0));


    const salesData = {
      sales: validSales.map(sale => ({
        ...sale._doc,
        customer: sale.customer || "Unknown",
        productName: sale.productName || sale.orderId.productName || "Unknown",
        totalAmount: Math.round(sale.totalAmount || 0),
        charges: Math.round((sale.gst || 0) + (sale.shipping || 0)),
        finalAmount: Math.round(sale.finalAmount || 0),
        discount: Math.round(sale.discount || 0),
        couponDiscount: Math.round(sale.couponDiscount || 0),
        quantity: sale.quantity || sale.orderId.quantity || 1,
        paymentMethod: sale.paymentMethod || sale.orderId.paymentMethod || "Unknown"
      })),
      spltotalSales,
      totalSales,
      spltotalCoupons,
      spltotalDiscounts,
      orderCount: totalSalesRecords,
      discounts: totalDiscounts,
      coupons: totalCoupons,
      totalCharges,
      chartData: validSales.map(sale => ({
        date: sale.date.toISOString().split('T')[0],
        amount: Math.round(sale.finalAmount || 0)
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
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).render('admin/pageerror', {
      message: 'Error loading sales report',
      error: error.message
    });
  }
};

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
          return res.status(STATUS_CODES.BAD_REQUEST).json({
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

    const deliveredOrders = await Order.find({ status: 'delivered' }).select('_id quantity paymentMethod productName');
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
          totalCharges: 0,
          chartData: []
        }
      });
    }

    query.orderId = { $in: orderIds };

    const sales = await Sale.find(query)
      .populate({
        path: 'orderId',
        select: 'orderId quantity paymentMethod productName'
      })
      .sort({ date: -1 });

    const validSales = sales.filter(sale => sale.orderId);

    const totalSales = Math.round(validSales.reduce((sum, sale) => sum + (sale.finalAmount || 0), 0));
    const totalDiscounts = Math.round(validSales.reduce((sum, sale) => sum + (sale.discount || 0), 0));
    const totalCoupons = Math.round(validSales.reduce((sum, sale) => sum + (sale.couponDiscount || 0), 0));
    const totalCharges = Math.round(validSales.reduce((sum, sale) => sum + (sale.gst || 0) + (sale.shipping || 0), 0));

        const splquwery = await Order.find({
      status: "delivered",
      deliveredOn: query.date
    })

    console.log("splquwery:", splquwery)

    const spltotalSales = Math.round(splquwery.reduce((sum, sale) => sum + (sale.finalAmount || 0), 0));
    const spltotalDiscounts = Math.round(splquwery.reduce((sum, sale) => sum + (sale.discount || 0), 0));
    const spltotalCoupons = Math.round(splquwery.reduce((sum, sale) => sum + (sale.couponDiscount || 0), 0));


    const salesData = {
      sales: validSales
        .map(sale => ({
          orderId: sale.orderId.orderId,
          customer: sale.customer || "Unknown",
          productName: sale.productName || sale.orderId.productName || "Unknown",
          totalAmount: Math.round(sale.totalAmount || 0),
          charges: Math.round((sale.gst || 0) + (sale.shipping || 0)),
          finalAmount: Math.round(sale.finalAmount || 0),
          discount: Math.round(sale.discount || 0),
          couponDiscount: Math.round(sale.couponDiscount || 0),
          date: sale.date,
          quantity: sale.quantity || sale.orderId.quantity || 1,
          paymentMethod: sale.paymentMethod || sale.orderId.paymentMethod || "Unknown"
        })),
      totalSales,
      spltotalDiscounts,
      spltotalCoupons,
       spltotalSales,
      orderCount: validSales.length,
      discounts: totalDiscounts,
      coupons: totalCoupons,
      totalCharges,

      chartData: validSales
        .map(sale => ({
          date: sale.date.toISOString().split('T')[0],
          amount: Math.round(sale.finalAmount || 0)
        }))
    };

    res.json({ success: true, salesData });
  } catch (error) {
    console.error('Error in getSalesReport:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: `Internal server error: ${error.message}`
    });
  }
};


const generatePDF = async (res, salesData, query) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'portrait' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#222').text('Sales Report', { align: 'center' });
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text('Summary');
  doc.font('Helvetica').fontSize(12).fillColor('#444')
    .text(`Total Sales:  ₹${Math.round(salesData.spltotalSales || 0).toLocaleString()}`)
    .text(`Total Orders:  ${salesData.orderCount || 0}`)
    .text(`Total Discounts & Coupon:  ₹${Math.round((salesData.spltotalDiscounts || 0)).toLocaleString()}`)
    .text(`Total Charges:  ₹${Math.round(salesData.totalCharges || 0).toLocaleString()}`);
  doc.moveDown(1);

  const allSales = await Sale.find(query)
    .populate({ path: 'orderId', select: 'orderId status quantity paymentMethod' })
    .sort({ date: -1 });

  const validSales = allSales.filter(sale => sale.orderId && sale.orderId.orderId);
  if (!validSales.length) {
    doc.end();
    return;
  }

  const headers = [
    { key: 'date', label: 'Date' },
    { key: 'orderId', label: 'Order ID' },
    { key: 'customer', label: 'Customer' },
    { key: 'productName', label: 'Product Name' },
    { key: 'qty', label: 'Qty' },
    { key: 'total', label: 'Total' },
    // { key: 'charges', label: 'Charges' },
    { key: 'discount', label: 'Discount' },
    { key: 'final', label: 'Final' },
    { key: 'payment', label: 'Payment' }
  ];

  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.margins.right;
  const usableWidth = doc.page.width - pageLeft - pageRight;

  const cellValue = (sale, key) => {
    switch (key) {
      case 'date': return new Date(sale.date).toLocaleDateString();
      case 'orderId': {
        const id = (sale.orderId && sale.orderId.orderId)
          ? sale.orderId.orderId.toString()
          : 'Unknown';
        return id.length > 8 ? `${id.slice(0, 13)}` : id;
      }
      case 'customer': return sale.customer || 'Unknown';
      case 'productName': return sale.productName || (sale.orderId && sale.orderId.productName) || 'Unknown';
      case 'qty': return String(sale.quantity || (sale.orderId && sale.orderId.quantity) || 1);
      case 'total': return `₹${Math.round(sale.totalAmount || 0).toLocaleString()}`;
      // case 'charges': return `₹${Math.round((sale.gst || 0) + (sale.shipping || 0)).toLocaleString()}`;
      case 'discount': return `₹${Math.round((sale.discount || 0) + (sale.couponDiscount || 0)).toLocaleString()}`;
      case 'final': return `₹${Math.round(sale.finalAmount || 0).toLocaleString()}`;
      case 'payment': return sale.paymentMethod || (sale.orderId && sale.orderId.paymentMethod) || 'Unknown';
      default: return '';
    }
  };

  const truncateToWidth = (text, maxWidth, fontName, fontSize) => {
    doc.font(fontName).fontSize(fontSize);
    if (doc.widthOfString(text) <= maxWidth) return text;
    const ell = '…';
    let low = 0, high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const substr = text.slice(0, mid) + ell;
      if (doc.widthOfString(substr) <= maxWidth) low = mid;
      else high = mid - 1;
    }
    return text.slice(0, low) + ell;
  };

  let tableFont = 'Helvetica';
  let headerFont = 'Helvetica-Bold';
  let fontSize = 10;         
  const minFontSize = 6;     
  let colWidths = [];
  let rowHeight = 0;
  let fits = false;

  const tableStartY = doc.y + 6;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20; 
  const availableHeight = () => bottomLimit - tableStartY;

  while (fontSize >= minFontSize && !fits) {
    doc.font(tableFont).fontSize(fontSize);

    colWidths = headers.map(h => {
      const headerW = doc.widthOfString(h.label);
      let maxCellW = headerW;
      for (const sale of validSales) {
        const text = cellValue(sale, h.key);
        const w = doc.widthOfString(text);
        if (w > maxCellW) maxCellW = w;
      }
      const padding = 10; 
      return Math.ceil(maxCellW + padding);
    });

    const totalWidth = colWidths.reduce((s, w) => s + w, 0);

    rowHeight = Math.ceil(fontSize + 8);

    const headerBarHeight = Math.ceil(fontSize + 8);
    const rowsPossible = Math.floor((availableHeight() - headerBarHeight) / rowHeight);

    if (totalWidth <= usableWidth && rowsPossible >= validSales.length) {
      fits = true;
      break;
    }

    fontSize -= 0.5;
  }

  if (!fits) {
    fontSize = Math.max(fontSize, minFontSize);
    doc.font(tableFont).fontSize(fontSize);
    colWidths = headers.map(h => {
      const headerW = doc.widthOfString(h.label);
      let maxCellW = headerW;
      for (const sale of validSales) {
        const text = cellValue(sale, h.key);
        const w = doc.widthOfString(text);
        if (w > maxCellW) maxCellW = w;
      }
      return Math.ceil(maxCellW + 10);
    });
  }

  let totalWidth = colWidths.reduce((s, w) => s + w, 0);
  if (totalWidth > usableWidth) {
    const scale = usableWidth / totalWidth;
    colWidths = colWidths.map(w => Math.floor(w * scale));
    totalWidth = colWidths.reduce((s, w) => s + w, 0);
    if (totalWidth < usableWidth) {
      colWidths[colWidths.length - 1] += (usableWidth - totalWidth);
      totalWidth = usableWidth;
    }
  }

  let x = pageLeft;
  let y = tableStartY;

  const headerBarHeight = Math.ceil(fontSize + 10);
  doc.rect(x - 2, y - 2, usableWidth + 4, headerBarHeight + 4).fill('#4CAF50');
  doc.fillColor('#fff').font(headerFont).fontSize(Math.max(fontSize, 9));

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const w = colWidths[i];
    const align = ['total', 'charges', 'final', 'discount'].includes(h.key) ? 'right' : (h.key === 'qty' ? 'center' : 'left');
    doc.text(h.label, x + 4, y + 3, { width: w - 8, align });
    x += w;
  }

  y += headerBarHeight + 6;
  doc.font(tableFont).fontSize(fontSize).fillColor('#000');

  let rowIndex = 0;
  const maxYPerPage = doc.page.height - doc.page.margins.bottom - 10;

  for (const sale of validSales) {
    if (y + rowHeight > maxYPerPage) {
     
      doc.addPage({ size: 'A4', layout: 'portrait', margin: doc.page.margins });
      x = doc.page.margins.left;
      y = doc.page.margins.top;
      doc.rect(x - 2, y - 2, usableWidth + 4, headerBarHeight + 4).fill('#4CAF50');
      doc.fillColor('#fff').font(headerFont).fontSize(Math.max(fontSize, 9));
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        const w = colWidths[i];
        const align = ['total', 'charges', 'final', 'discount'].includes(h.key) ? 'right' : (h.key === 'qty' ? 'center' : 'left');
        doc.text(h.label, x + 4, y + 3, { width: w - 8, align });
        x += w;
      }
      y += headerBarHeight + 6;
      doc.font(tableFont).fontSize(fontSize).fillColor('#000');
    }

    const bg = rowIndex % 2 === 0 ? '#f9f9f9' : '#ffffff';
    doc.rect(doc.page.margins.left - 2, y - 2, usableWidth + 4, rowHeight + 4).fill(bg).fillColor('#000');

    x = doc.page.margins.left;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const w = colWidths[i];
      const raw = cellValue(sale, h.key);
      const maxTextWidth = w - 8; 
      const textToDraw = (doc.widthOfString(raw) <= maxTextWidth) ? raw : truncateToWidth(raw, maxTextWidth, tableFont, fontSize);
      const align = ['total', 'charges', 'final', 'discount'].includes(h.key) ? 'right' : (h.key === 'qty' ? 'center' : 'left');
      doc.text(textToDraw, x + 4, y + (rowHeight - fontSize) / 2, { width: w - 8, align });
      x += w;
    }

    y += rowHeight + 6;
    rowIndex++;
  }

  doc.end();
};


const generateExcel = async (res, salesData, query) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');

  worksheet.addRow(['Sales Report']).getCell(1).font = { size: 14, bold: true };
  worksheet.addRow(['Summary']).getCell(1).font = { size: 12, bold: true };
  worksheet.addRow(['Total Sales', '', `₹${Math.round(salesData.spltotalSales || 0).toLocaleString()}`]);
  worksheet.addRow(['Total Orders', '', salesData.orderCount || 0]);
  worksheet.addRow(['Total Discounts & Coupons', '', `₹${Math.round((salesData.spltotalDiscounts || 0)).toLocaleString()}`]);
  worksheet.addRow(['Total Charges', '', `₹${Math.round(salesData.totalCharges || 0).toLocaleString()}`]);
  worksheet.addRow([]);

  const allSales = await Sale.find(query)
    .populate({
      path: 'orderId',
      select: 'orderId status quantity paymentMethod'
    })
    .sort({ date: -1 });

  const validSales = allSales.filter(sale => sale.orderId && sale.orderId.orderId);

  worksheet.addRow(['Detailed Sales']).getCell(1).font = { size: 12, bold: true };
  worksheet.addRow(['Date', 'Order ID', 'Customer', 'Product Name', 'Quantity', 'Total Amount', 'Charges', 'Final Amount', 'Discount & Coupon', 'Payment Method']).eachCell(cell => {
    cell.font = { bold: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  validSales.forEach(sale => {
    worksheet.addRow([
      new Date(sale.date).toLocaleDateString(),
      sale.orderId.orderId.toString(),
      sale.customer || "Unknown",
      sale.productName || sale.orderId.productName || "Unknown",
      sale.quantity || sale.orderId.quantity || 1,
      `₹${Math.round(sale.totalAmount || 0).toLocaleString()}`,
      `₹${Math.round(sale.finalAmount-(sale.totalAmount-sale.discount)|| 0).toLocaleString()}`,
      `₹${Math.round(sale.finalAmount || 0).toLocaleString()}`,
      `₹${Math.round((sale.discount || 0) + (sale.couponDiscount || 0)).toLocaleString()}`,
      sale.paymentMethod || sale.orderId.paymentMethod || "Unknown"
    ]);
  });

  worksheet.columns = [
    { key: 'date', width: 15 },
    { key: 'orderId', width: 30 },
    { key: 'customer', width: 20 },
    { key: 'productName', width: 20 },
    { key: 'quantity', width: 10 },
    { key: 'totalAmount', width: 15 },
    { key: 'charges', width: 15 },
    { key: 'finalAmount', width: 15 },
    { key: 'discount', width: 15 },
    { key: 'paymentMethod', width: 15 }
  ];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
  await workbook.xlsx.write(res);
};

module.exports = {
  renderSalesReport,
  getSalesReport
};
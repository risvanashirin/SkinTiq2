const mongoose = require('mongoose');
const Order = require("../../models/orderSchema");
const Sale = require("../../models/salesSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wallet = require("../../models/walletSchema");

const getOrders = async (req, res) => {
  try {
    const admin = req.admin;

    if (!admin || !admin.isAdmin) {
      return res.redirect('/admin/login');
    }

    // Validate query parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 4));
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || '';
    const status = req.query.status?.trim() || '';
    const sort = ['orderId', 'userName', 'productName', 'quantity', 'finalAmount', 'status', 'createdAt'].includes(req.query.sort)
      ? req.query.sort
      : 'createdAt';
    const direction = req.query.direction === 'asc' ? 1 : -1;

    // Build query
    const query = {};
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const userIds = users.map(user => user._id);

      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { userId: { $in: userIds } },
        { productName: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.status = status;
    }

    // Build sort options
    const sortOptions = {};
    if (sort === 'userName') {
      sortOptions['userId.name'] = direction;
    } else {
      sortOptions[sort] = direction;
    }

    // Fetch orders
    const totalOrders = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate("userId")
      .populate("product")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    // Format orders
    const formattedOrders = orders.map(order => ({
      ...order._doc,
      orderId: order.orderId?.toString() || "N/A",
      userId: order.userId || { name: "Unknown", email: "N/A" },
      productName: order.productName || (order.product ? order.product.name : "N/A"),
      productImages: order.productImages && order.productImages.length > 0 ? order.productImages[0] : 'N/A',
      product: order.product || { _id: null, name: "N/A" },
      quantity: order.quantity || 0,
      finalAmount: order.finalAmount || 0,
      status: order.status || "pending"
    }));

    // Construct queryParams for pagination
    const queryParams = [
      limit !== 4 ? `limit=${limit}` : '',
      search ? `search=${encodeURIComponent(search)}` : '',
      status ? `status=${encodeURIComponent(status)}` : '',
      sort !== 'createdAt' ? `sort=${encodeURIComponent(sort)}` : '',
      direction !== 'desc' ? `direction=${encodeURIComponent(direction)}` : ''
    ].filter(param => param).join('&');

    res.render("admin-order", {
      orders: formattedOrders,
      title: "Order Management",
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit) || 1,
      limit,
      search,
      status,
      sort,
      direction,
      adminName: admin.name,
      baseUrl: '/admin/order',
      queryParams: queryParams ? `&${queryParams}` : '',
      ariaLabel: 'Order list pagination'
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).send("Internal Server Error");
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log("Fetching order details for ID:", orderId);
    const order = await Order.findById(orderId)
      .populate("userId")
      .populate("product");

    if (!order) {
      console.log("Order not found:", orderId);
      return res.status(404).send("Order not found");
    }

    const formattedOrder = {
      ...order._doc,
      orderId: order.orderId || "N/A",
      userId: order.userId || { name: "Unknown", email: "N/A" },
      productName: order.productName || (order.product ? order.product.name : "N/A"),
      productImages: order.productImages[0] || "N/A",
      product: order.product || { _id: null, name: "N/A" },
      quantity: order.quantity || 0,
      finalAmount: order.finalAmount || 0,
      status: order.status || "pending"
    };

    res.render("admin-order-details", { order: formattedOrder });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).send("Internal Server Error");
  }
};

// const updateOrderStatus = async (req, res) => {
//   try {
//     const { orderId, status } = req.body;

//     if (!orderId || !status) {
//       console.log("Missing orderId or status");
//       return res.status(400).json({ success: false, message: "Order ID and status are required" });
//     }

//     if (!mongoose.Types.ObjectId.isValid(orderId)) {
//       console.log("Invalid orderId format:", orderId);
//       return res.status(400).json({ success: false, message: "Invalid order ID format" });
//     }

//     const order = await Order.findById(orderId);
//     if (!order) {
//       console.log("Order not found:", orderId);
//       return res.status(404).json({ success: false, message: "Order not found" });
//     }

//     if (order.status === "cancelled") {
//       console.log("Cannot update cancelled order:", orderId);
//       return res.status(400).json({ success: false, message: "Cannot update cancelled order" });
//     }

//     const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'return request', 'returned', 'failed'];

//     if (!validStatuses.includes(status)) {
//       console.log("Invalid status:", status);
//       return res.status(400).json({ success: false, message: "Invalid status" });
//     }

//     if (status === "return request") {
//       return res.status(403).json({ success: false, message: "You cannot manually set 'return request' status" });
//     }

//     order.status = status;
//     order.updatedAt = new Date();

//     if (status === "delivered") {
//       order.deliveredOn = new Date();

//       const existingSale = await Sale.findOne({ orderId: order._id });
//       if (!existingSale) {
//         const couponDiscount = order.couponApplied && order.couponCode ? order.discount : 0;

//         const sale = new Sale({
//           orderId: order._id,
//           amount: order.finalAmount || order.totalPrice || 0,
//           discount: order.discount || 0,
//           coupon: order.couponDiscount || 0,
//           date: order.deliveredOn || new Date()
//         });

//         await sale.save();
//         console.log('Sale created:', sale);
//       } else {
//         console.log("Sale data already exists for order:", orderId);
//       }
//     }

//     await order.save();
//     res.json({ success: true, message: "Order status updated successfully" });
//   } catch (error) {
//     console.error("Error updating order status:", error);
//     res.status(500).json({ success: false, message: `Internal server error: ${error.message}` });
//   }
// };


const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      console.log("Missing orderId or status");
      return res.status(400).json({ success: false, message: "Order ID and status are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.log("Invalid orderId format:", orderId);
      return res.status(400).json({ success: false, message: "Invalid order ID format" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.log("Order not found:", orderId);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status === "cancelled") {
      console.log("Cannot update cancelled order:", orderId);
      return res.status(400).json({ success: false, message: "Cannot update cancelled order" });
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'return request', 'returned', 'failed'];

    if (!validStatuses.includes(status)) {
      console.log("Invalid status:", status);
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    if (status === "return request") {
      return res.status(403).json({ success: false, message: "You cannot manually set 'return request' status" });
    }

    // Define status progression
    const statusProgression = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
    const currentStatusIndex = statusProgression.indexOf(order.status);
    const newStatusIndex = statusProgression.indexOf(status);

    // Prevent moving to a previous status
    if (newStatusIndex <= currentStatusIndex) {
      console.log(`Cannot move from ${order.status} to ${status}`);
      return res.status(400).json({
        success: false,
        message: `Cannot set status to ${status}. Only upcoming statuses are allowed.`,
      });
    }

    order.status = status;
    order.updatedAt = new Date();

    if (status === "delivered") {
      order.deliveredOn = new Date();

      const existingSale = await Sale.findOne({ orderId: order._id });
      if (!existingSale) {
        const couponDiscount = order.couponApplied && order.couponCode ? order.discount : 0;

        const sale = new Sale({
          orderId: order._id,
          amount: order.finalAmount || order.totalPrice || 0,
          discount: order.discount || 0,
          coupon: order.couponDiscount || 0,
          date: order.deliveredOn || new Date(),
        });

        await sale.save();
        console.log('Sale created:', sale);
      } else {
        console.log("Sale data already exists for order:", orderId);
      }
    }

    await order.save();
    res.json({ success: true, message: "Order status updated successfully" });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ success: false, message: `Internal server error: ${error.message}` });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    console.log("Cancelling order:", { orderId, reason });

    if (!orderId || !reason) {
      console.log("Missing orderId or reason");
      return res.status(400).json({ success: false, message: "Order ID and reason are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.log("Invalid orderId format:", orderId);
      return res.status(400).json({ success: false, message: "Invalid order ID format" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.log("Order not found:", orderId);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status === "cancelled" || order.status === "delivered") {
      console.log("Cannot cancel order in status:", order.status);
      return res.status(400).json({ success: false, message: `Cannot cancel order in ${order.status} status` });
    }

    order.status = "cancelled";
    order.updatedAt = new Date();
    order.cancelReason = reason;

    if (order.product) {
      console.log("Restocking product:", order.product, "Quantity:", order.quantity);
      const product = await Product.findById(order.product);
      if (!product) {
        console.warn("Product not found for order:", orderId);
        return res.status(404).json({ success: false, message: "Associated product not found" });
      }
      await Product.findByIdAndUpdate(order.product, {
        $inc: { quantity: order.quantity || 0 }
      });
    } else {
      console.warn("No product associated with order:", orderId);
    }

    // Credit wallet only for prepaid orders or delivered COD orders
    if (order.paymentMethod !== 'COD' || order.status === 'delivered') {
      console.log(`Crediting wallet for order ${orderId}: paymentMethod=${order.paymentMethod}, status=${order.status}, amount=${order.finalAmount}`);
      const wallet = await Wallet.findOneAndUpdate(
        { userId: order.userId },
        {
          $inc: { balance: order.finalAmount || 0 },
          $push: {
            transactions: {
              type: 'Credit',
              amount: order.finalAmount || 0,
              description: `Refund for order #${order.orderId} cancellation`,
              status: 'Completed',
            },
          },
        },
        { upsert: true, new: true }
      );

      if (!wallet) {
        console.error('Failed to update wallet for user:', order.userId);
        return res.status(500).json({ success: false, message: 'Failed to process refund to wallet' });
      }
    } else {
      console.log(`Skipping wallet credit for COD order ${orderId} (status: ${order.status})`);
    }

    await order.save();

    console.log("Order cancelled successfully:", orderId);
    res.json({
      success: true,
      message: "Order cancelled successfully"
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ success: false, message: `Internal server error: ${error.message}` });
  }
};

const handleReturnRequest = async (req, res) => {
  try {
    const { orderId, action, message, category, requestToken } = req.body;

    if (!orderId || !action || !requestToken) {
      console.log("Missing orderId, action, or requestToken:", { orderId, action, requestToken });
      return res.status(400).json({
        success: false,
        message: "Order ID, action, and request token are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.log("Invalid orderId format:", orderId);
      return res.status(400).json({
        success: false,
        message: "Invalid order ID format",
      });
    }

    console.log(`Processing return request for order ${orderId} with token ${requestToken} at ${new Date().toISOString()}`);

    const order = await Order.findOneAndUpdate(
      {
        _id: orderId,
        status: "return request",
        stockRestored: false,
      },
      {
        $set: {
          status: action === "approve" ? "returned" : "delivered",
          stockRestored: action === "approve",
          updatedAt: new Date(),
          ...(action === "deny" && { returnReason: category, returnDescription: message }),
        },
      },
      { new: true }
    );

    if (!order) {
      console.log("Order not found or already processed:", orderId);
      return res.status(400).json({
        success: false,
        message: "Order not found, not in return request state, or already processed",
      });
    }

    if (action === "approve") {
      if (order.product) {
        console.log("Restocking product:", order.product, "Quantity:", order.quantity);
        const product = await Product.findById(order.product);
        if (!product) {
          console.warn("Product not found for order:", orderId);
          return res.status(404).json({
            success: false,
            message: "Associated product not found",
          });
        }
        product.quantity += order.quantity || 0;
        await product.save();
        console.log(`Stock updated for product ${order.product}: +${order.quantity}`);
      } else {
        console.warn("No product associated with order:", orderId);
      }

      const wallet = await Wallet.findOneAndUpdate(
        { userId: order.userId },
        {
          $inc: { balance: order.finalAmount || 0 },
          $push: {
            transactions: {
              type: 'Credit',
              amount: order.finalAmount || 0,
              description: `Refund for order #${order.orderId} return`,
              status: 'Completed',
            },
          },
        },
        { upsert: true, new: true }
      );

      if (!wallet) {
        console.error('Failed to update wallet for user:', order.userId);
        return res.status(500).json({ success: false, message: 'Failed to process refund to wallet' });
      }
    }

    console.log(`Return request handled for order ${orderId}: ${action}`);
    res.json({
      success: true,
      message: `Return request ${action}d successfully`,
    });
  } catch (error) {
    console.error(`Error handling return request for order ${orderId}:`, error);
    res.status(500).json({
      success: false,
      message: `Internal server error: ${error.message}`,
    });
  }
};

module.exports = {
  getOrders,
  getOrderDetails,
  updateOrderStatus,
  cancelOrder,
  handleReturnRequest,
};
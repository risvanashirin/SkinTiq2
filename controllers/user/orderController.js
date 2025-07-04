

const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Category = require('../../models/categorySchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer');
const path = require('path');
const ejs = require('ejs');
const fs = require('fs');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');

// Initialize Razorpay
const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const loadcheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.render('checkout', {
        cart: null,
        addresses: [],
        totalPrice: 0,
        discount: 0,
        couponDiscount: 0,
        gst: 0,
        shippingCharge: 20,
        finalPrice: 0,
        coupons: [],
        appliedCoupon: null,
        error: 'Please log in to access checkout.',
        outOfStockProducts: [],
      });
    }

    const cart = await Cart.findOne({ userId }).populate('cart.productId');
    const addresses = await Address.find({ userId });

    const currentDate = new Date();
    const coupons = await Coupon.find({
      isList: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
      $or: [
        { userId: { $size: 0 } },
        { userId: new mongoose.Types.ObjectId(userId) }
      ],
      usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
    });

    if (!cart || !cart.cart.length) {
      return res.render('checkout', {
        cart: null,
        addresses: addresses.map(addr => addr.address).flat(),
        totalPrice: 0,
        discount: 0,
        couponDiscount: 0,
        gst: 0,
        shippingCharge: 20,
        finalPrice: 0,
        coupons,
        appliedCoupon: req.session.appliedCoupon || null,
        error: '',
        outOfStockProducts: [],
      });
    }

    const outOfStockProducts = cart.cart.filter(item => item.productId.quantity <= 0);
    let totalPrice = cart.cart.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
    let discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
    let gst = totalPrice > 2000 ? 10 : 0;
    let shippingCharge = 20;
    let couponDiscount = req.session.appliedCoupon ? req.session.appliedCoupon.offerPrice : 0;
    let finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

    if (outOfStockProducts.length > 0) {
      await Cart.updateOne(
        { userId },
        { $pull: { cart: { productId: { $in: outOfStockProducts.map(item => item.productId._id) } } } }
      );
      const updatedCart = await Cart.findOne({ userId }).populate('cart.productId');
      const validItems = updatedCart ? updatedCart.cart.filter(item => item.productId.quantity > 0) : [];
      totalPrice = validItems.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
      discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
      gst = totalPrice > 2000 ? 10 : 0;
      couponDiscount = req.session.appliedCoupon ? req.session.appliedCoupon.offerPrice : 0;
      shippingCharge = 20;
      finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

      return res.render('checkout', {
        cart: validItems,
        addresses: addresses.map(addr => addr.address).flat(),
        totalPrice,
        discount,
        couponDiscount,
        gst,
        shippingCharge,
        finalPrice,
        coupons,
        appliedCoupon: req.session.appliedCoupon || null,
        error: 'Some products were out of stock and removed from your cart.',
        outOfStockProducts,
      });
    }

    res.render('checkout', {
      cart: cart.cart.filter(item => item.productId.quantity > 0),
      addresses: addresses.map(addr => addr.address).flat(),
      totalPrice,
      discount,
      couponDiscount,
      gst,
      shippingCharge,
      finalPrice,
      coupons,
      appliedCoupon: req.session.appliedCoupon || null,
      error: null,
      outOfStockProducts: [],
    });
  } catch (error) {
    console.error('Error loading checkout page:', error);
    res.render('checkout', {
      cart: null,
      addresses: [],
      totalPrice: 0,
      discount: 0,
      couponDiscount: 0,
      gst: 0,
      shippingCharge: 20,
      finalPrice: 0,
      coupons: [],
      appliedCoupon: null,
      error: 'Failed to load checkout page.',
      outOfStockProducts: [],
    });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode, cartTotal } = req.body;
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to apply a coupon.' });
    }

    const coupon = await Coupon.findOne({
      name: couponCode.toUpperCase(),
      isList: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { userId: { $size: 0 } },
        { userId: new mongoose.Types.ObjectId(userId) }
      ],
      usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
    });

    if (!coupon) {
      return res.status(400).json({ success: false, message: 'Invalid, expired, or already used coupon.' });
    }

    if (cartTotal < coupon.minimumPrice) {
      return res.status(400).json({ success: false, message: `Minimum purchase amount is ₹${coupon.minimumPrice}.` });
    }

    req.session.appliedCoupon = {
      name: coupon.name,
      offerPrice: coupon.offerPrice,
      minimumPrice: coupon.minimumPrice
    };

    const discount = cartTotal > 1500 ? cartTotal * 0.1 : 0;
    const gst = cartTotal > 2000 ? 10 : 0;
    const shippingCharge = 20;
    const finalPrice = cartTotal - discount - coupon.offerPrice + gst + shippingCharge;

    res.json({
      success: true,
      discount,
      couponDiscount: coupon.offerPrice,
      finalPrice,
      coupon: req.session.appliedCoupon,
      message: 'Coupon applied successfully.'
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to apply coupon.' });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to remove coupon.' });
    }

    const cart = await Cart.findOne({ userId }).populate('cart.productId');
    if (!cart || !cart.cart.length) {
      req.session.appliedCoupon = null;
      return res.json({
        success: true,
        discount: 0,
        couponDiscount: 0,
        finalPrice: 0,
        message: 'Cart is empty.',
      });
    }

    const totalPrice = cart.cart.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
    const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
    const gst = totalPrice > 2000 ? 10 : 0;
    const shippingCharge = 20;
    const finalPrice = totalPrice - discount + gst + shippingCharge;

    req.session.appliedCoupon = null;

    res.json({
      success: true,
      discount,
      couponDiscount: 0,
      finalPrice,
      message: 'Coupon removed successfully.',
    });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to remove coupon.' });
  }
};

const createRazorpay = async (req, res) => {
    const { amount } = req.body;
    const userId = req.session.user;

    try {
        console.log('createRazorpay: Creating order', { userId, amount });

        const uuid = uuidv4().replace(/-/g, '');
        const receipt = `rcpt_${uuid.substring(0, 36)}`;
        console.log('createRazorpay: Generated receipt', { receipt, length: receipt.length });

        const order = await rzp.orders.create({
            amount: Math.round(amount * 100),
            currency: 'INR',
            receipt: receipt,
        });

        console.log('createRazorpay: Razorpay order created', {
            orderId: order.id,
            razorpayOrderId: order.id,
        });

        return res.status(200).json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
            },
            orderId: order.id,
        });
    } catch (error) {
        console.error('createRazorpay: Error creating order:', {
            message: error.message,
            statusCode: error.statusCode,
            errorDetails: error.error || error,
        });
        return res.status(500).json({
            success: false,
            message: error.error?.description || 'Failed to create Razorpay order.',
        });
    }
};

// const placeorder = async (req, res) => {
//   const userId = req.session.user;
//   let {
//     selectedAddress,
//     paymentMethod,
//     couponCode,
//     razorpayPaymentId,
//     totalAmount,
//     orderId: razorpayOrderId,
//     razorpay_signature,
//   } = req.body || {};

//   paymentMethod = Array.isArray(paymentMethod) ? paymentMethod[0] : paymentMethod;
//   totalAmount = Array.isArray(totalAmount) ? parseFloat(totalAmount[0]) : parseFloat(totalAmount);

//   try {
//     console.log('placeorder:', { userId, paymentMethod, totalAmount, couponCode, razorpayOrderId });

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Please login to place order' });
//     }

//     if (!selectedAddress) {
//       return res.status(400).json({ success: false, message: 'Please select a shipping address.' });
//     }

//     const addressDoc = await Address.findOne({ userId, 'address._id': selectedAddress });
//     if (!addressDoc) {
//       return res.status(400).json({ success: false, message: 'Invalid address selected.' });
//     }
//     const selectedAddressData = addressDoc.address.find(addr => addr._id.toString() === selectedAddress);

//     const cart = await Cart.findOne({ userId }).populate('cart.productId');
//     if (!cart || cart.cart.length === 0) {
//       return res.status(400).json({ success: false, message: 'Your cart is empty.' });
//     }

//     if (paymentMethod === 'COD' && totalAmount > 1000) {
//       return res.status(400).json({ success: false, message: 'COD not available for orders above ₹1000.' });
//     }

//     const totalPrice = cart.cart.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
//     const baseDiscount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;

//     let couponDiscount = 0;
//     let effectiveCouponCode = null;
//     // Prioritize coupon from request, then session, then failed order
//     if (couponCode) {
//       effectiveCouponCode = couponCode;
//     } else if (req.session.appliedCoupon?.name) {
//       effectiveCouponCode = req.session.appliedCoupon.name;
//     } else if (req.session.retryOrderId) {
//       const existingFailedOrders = await Order.find({ orderId: req.session.retryOrderId, userId, status: 'failed' });
//       if (existingFailedOrders.length > 0 && existingFailedOrders[0].couponCode) {
//         effectiveCouponCode = existingFailedOrders[0].couponCode;
//       }
//     }

//     if (effectiveCouponCode) {
//       const coupon = await Coupon.findOne({
//         name: effectiveCouponCode,
//         usedBy: { $nin: [userId] },
//         isList: true,
//         startDate: { $lte: new Date() },
//         endDate: { $gte: new Date() }
//       });
//       if (coupon && totalPrice >= coupon.minimumPrice) {
//         couponDiscount = coupon.offerPrice;
//         effectiveCouponCode = coupon.name;
//         console.log('placeorder: Coupon applied', { couponCode: effectiveCouponCode, couponDiscount });
//       } else {
//         effectiveCouponCode = null; // Reset if coupon is invalid
//         req.session.appliedCoupon = null; // Clear invalid session coupon
//       }
//     }

//     // Use retryOrderId from session if available, otherwise use razorpayOrderId or generate new
//     const sharedOrderId = req.session.retryOrderId || razorpayOrderId || uuidv4();

//     // Check for existing orders with the same orderId
//     const existingOrders = await Order.find({ orderId: sharedOrderId, userId });
//     const hasNonFailedOrders = existingOrders.some(order => order.status !== 'failed');

//     if (hasNonFailedOrders) {
//       return res.status(400).json({
//         success: false,
//         message: 'Order has already been placed successfully and cannot be retried.',
//         redirect: `/order-confirmation/${sharedOrderId}`
//       });
//     }

//     const existingFailedOrders = existingOrders.filter(order => order.status === 'failed');

//     if (paymentMethod === 'RazorPay' && !razorpayPaymentId && !razorpay_signature) {
//       if (existingFailedOrders.length > 0) {
//         for (const order of existingFailedOrders) {
//           order.status = 'failed';
//           order.paymentMethod = 'RazorPay';
//           order.invoiceDate = new Date();
//           await order.save();
//         }
//         console.log('placeorder: Updated existing failed orders', { sharedOrderId });
//       } else {
//         const failedOrders = [];
//         for (const item of cart.cart) {
//           if (!item.productId) continue;
//           const itemTotalPrice = item.productId.salePrice * item.quantity;
//           const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
//           const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
//           const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
//           const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length);
//           const failedOrder = new Order({
//             orderId: sharedOrderId,
//             userId,
//             product: item.productId._id,
//             productName: item.productId.productName,
//             productImages: item.productId.productImage || [],
//             quantity: item.quantity,
//             price: item.productId.salePrice,
//             totalPrice: itemTotalPrice,
//             discount: itemDiscount + itemCouponDiscount,
//             discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
//             finalAmount,
//             address: selectedAddressData,
//             invoiceDate: new Date(),
//             status: 'failed',
//             paymentMethod: 'RazorPay',
//             couponApplied: !!effectiveCouponCode,
//             couponCode: effectiveCouponCode,
//           });
//           failedOrders.push(failedOrder);
//         }
//         await Order.insertMany(failedOrders);
//         console.log('placeorder: Failed orders saved', { sharedOrderId });
//       }
//       req.session.retryOrderId = null;
//       return res.status(400).json({
//         success: false,
//         message: 'Payment failed or cancelled.',
//         redirect: `/order-failed/${sharedOrderId}`
//       });
//     }

//     if (paymentMethod === 'RazorPay' && razorpayPaymentId && razorpayOrderId && razorpay_signature) {
//       const crypto = require('crypto');
//       const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
//       const generatedSignature = crypto
//         .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
//         .update(payload)
//         .digest('hex');

//       if (generatedSignature !== razorpay_signature) {
//         if (existingFailedOrders.length > 0) {
//           for (const order of existingFailedOrders) {
//             order.status = 'failed';
//             order.paymentMethod = 'RazorPay';
//             order.invoiceDate = new Date();
//             await order.save();
//           }
//         } else {
//           const failedOrders = [];
//           for (const item of cart.cart) {
//             if (!item.productId) continue;
//             const itemTotalPrice = item.productId.salePrice * item.quantity;
//             const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
//             const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
//             const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
//             const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length);
//             const failedOrder = new Order({
//               orderId: sharedOrderId,
//               userId,
//               product: item.productId._id,
//               productName: item.productId.productName,
//               productImages: item.productId.productImage || [],
//               quantity: item.quantity,
//               price: item.productId.salePrice,
//               totalPrice: itemTotalPrice,
//               discount: itemDiscount + itemCouponDiscount,
//               discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
//               finalAmount,
//               address: selectedAddressData,
//               invoiceDate: new Date(),
//               status: 'failed',
//               paymentMethod: 'RazorPay',
//               couponApplied: !!effectiveCouponCode,
//               couponCode: effectiveCouponCode,
//             });
//             failedOrders.push(failedOrder);
//           }
//           await Order.insertMany(failedOrders);
//         }
//         req.session.retryOrderId = null;
//         return res.status(400).json({
//           success: false,
//           message: 'Invalid payment signature.',
//           redirect: `/order-failed/${sharedOrderId}`
//         });
//       }
//     }

//     // Validate stock before proceeding
//     for (const item of cart.cart) {
//       if (!item.productId) continue;
//       if (item.productId.quantity < item.quantity) {
//         req.session.retryOrderId = null;
//         return res.status(400).json({
//           success: false,
//           message: `Product ${item.productId.productName} is out of stock.`
//         });
//       }
//     }

//     // Update existing failed orders or create new ones
//     if (existingFailedOrders.length > 0) {
//       for (const order of existingFailedOrders) {
//         const cartItem = cart.cart.find(item => item.productId._id.toString() === order.product.toString());
//         if (!cartItem || cartItem.quantity !== order.quantity) {
//           req.session.retryOrderId = null;
//           return res.status(400).json({
//             success: false,
//             message: `Cart mismatch for product ${order.productName}. Please retry from the original order.`
//           });
//         }
//         await Product.findByIdAndUpdate(order.product, {
//           $inc: { quantity: -order.quantity }
//         });
//         order.status = paymentMethod === 'COD' ? 'pending' : 'confirmed';
//         order.paymentMethod = paymentMethod;
//         order.invoiceDate = new Date();
//         order.couponApplied = !!effectiveCouponCode;
//         order.couponCode = effectiveCouponCode;
//         order.discount = baseDiscount > 0 ? (order.totalPrice / totalPrice) * baseDiscount : 0 + (effectiveCouponCode ? (order.totalPrice / totalPrice) * couponDiscount : 0);
//         order.discountedPrice = order.totalPrice - order.discount;
//         order.finalAmount = order.totalPrice - order.discount + (gst > 0 ? (order.totalPrice / totalPrice) * gst : 0) + (shippingCharge / cart.cart.length);
//         await order.save();
//       }
//     } else {
//       const orders = [];
//       let totalOrderAmount = 0;

//       for (const item of cart.cart) {
//         if (!item.productId) continue;
//         const itemTotalPrice = item.productId.salePrice * item.quantity;
//         const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
//         const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
//         const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
//         const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length);

//         const order = new Order({
//           orderId: sharedOrderId,
//           userId,
//           product: item.productId._id,
//           productName: item.productId.productName,
//           productImages: item.productId.productImage || [],
//           quantity: item.quantity,
//           price: item.productId.salePrice,
//           totalPrice: itemTotalPrice,
//           discount: itemDiscount + itemCouponDiscount,
//           discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
//           finalAmount,
//           address: selectedAddressData,
//           invoiceDate: new Date(),
//           status: paymentMethod === 'COD' ? 'pending' : 'confirmed',
//           paymentMethod,
//           couponApplied: !!effectiveCouponCode,
//           couponCode: effectiveCouponCode,
//         });

//         totalOrderAmount += finalAmount;
//         orders.push(order);

//         await Product.findByIdAndUpdate(item.productId._id, {
//           $inc: { quantity: -item.quantity }
//         });
//       }

//       if (!orders.length) {
//         req.session.retryOrderId = null;
//         return res.status(400).json({ success: false, message: 'No valid items in cart.' });
//       }

//       await Order.insertMany(orders);
//     }

//     const expectedTotal = totalPrice - baseDiscount - couponDiscount + gst + shippingCharge;
//     console.log('placeorder: Total check', { totalAmount, expectedTotal });
//     if (totalAmount && Math.abs(totalAmount - expectedTotal) > 0.01) {
//       req.session.retryOrderId = null;
//       return res.status(400).json({
//         success: false,
//         message: `Total amount mismatch. Client: ₹${totalAmount}, Server: ₹${expectedTotal}`
//       });
//     }

//     if (effectiveCouponCode) {
//       await Coupon.findOneAndUpdate(
//         { name: effectiveCouponCode },
//         { $addToSet: { usedBy: userId } }
//       );
//       req.session.appliedCoupon = null; // Clear after successful use
//     }

//     req.session.retryOrderId = null;
//     await Cart.findOneAndUpdate({ userId }, { $set: { cart: [] } });

//     return res.status(200).json({
//       success: true,
//       message: 'Order placed successfully.',
//       redirect: `/order-confirmation/${sharedOrderId}`
//     });
//   } catch (error) {
//     console.error('placeorder error:', error);
//     req.session.retryOrderId = null;
//     const fallbackOrderId = razorpayOrderId || uuidv4();
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to place order.',
//       redirect: `/order-failed/${fallbackOrderId}`
//     });
//   }
// };












const placeorder = async (req, res) => {
  const userId = req.session.user;
  let {
    selectedAddress,
    paymentMethod,
    couponCode,
    razorpayPaymentId,
    totalAmount,
    orderId: razorpayOrderId,
    razorpay_signature,
  } = req.body || {};

  // Normalize inputs
  paymentMethod = Array.isArray(paymentMethod) ? paymentMethod[0] : paymentMethod;
  totalAmount = Array.isArray(totalAmount) ? parseFloat(totalAmount[0]) : parseFloat(totalAmount);

  // Define sharedOrderId early to avoid ReferenceError
  let sharedOrderId = req.session.retryOrderId || razorpayOrderId || uuidv4();

  try {
    console.log('placeorder:', { userId, paymentMethod, totalAmount, couponCode, razorpayOrderId });

    // Validate user
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to place order',
        redirect: '/login',
      });
    }

    // Validate address
    if (!selectedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Please select a shipping address.',
        redirect: `/order-failed/${sharedOrderId}`,
      });
    }

    const addressDoc = await Address.findOne({ userId, 'address._id': selectedAddress });
    if (!addressDoc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address selected.',
        redirect: `/order-failed/${sharedOrderId}`,
      });
    }
    const selectedAddressData = addressDoc.address.find((addr) => addr._id.toString() === selectedAddress);

    // Structure address to match schema
    const address = {
      name: selectedAddressData.name,
      phone: selectedAddressData.phone,
      pincode: selectedAddressData.pincode,
      locality: selectedAddressData.locality || '',
      address: selectedAddressData.address || selectedAddressData.landMark || '',
      city: selectedAddressData.city,
      state: selectedAddressData.state,
      landmark: selectedAddressData.landMark || '',
      alternatePhone: selectedAddressData.altPhone || '',
      addressType: selectedAddressData.addressType || '',
    };

    // Fetch cart
    const cart = await Cart.findOne({ userId }).populate('cart.productId');
    if (!cart || cart.cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty.',
        redirect: `/order-failed/${sharedOrderId}`,
      });
    }

    // Validate COD limit
    if (paymentMethod === 'COD' && totalAmount > 1000) {
      return res.status(400).json({
        success: false,
        message: 'COD not available for orders above ₹1000.',
        redirect: `/order-failed/${sharedOrderId}`,
      });
    }

    // Calculate totals
    const totalPrice = cart.cart.reduce((sum, item) => sum + item.productId.salePrice * item.quantity, 0);
    const baseDiscount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
    const gst = totalPrice > 2000 ? 10 : 0;
    const shippingCharge = 20;

    // Handle coupon
    let couponDiscount = 0;
    let effectiveCouponCode = null;
    let couponApplied = false;
    if (couponCode) {
      effectiveCouponCode = couponCode;
    } else if (req.session.appliedCoupon?.name) {
      effectiveCouponCode = req.session.appliedCoupon.name;
    } else if (req.session.retryOrderId) {
      const existingFailedOrders = await Order.find({ orderId: req.session.retryOrderId, userId, status: 'failed' });
      if (existingFailedOrders.length > 0 && existingFailedOrders[0].couponCode) {
        effectiveCouponCode = existingFailedOrders[0].couponCode;
      }
    }

    if (effectiveCouponCode) {
      const coupon = await Coupon.findOne({
        name: effectiveCouponCode,
        usedBy: { $nin: [userId] },
        isList: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
      });
      if (coupon && totalPrice >= coupon.minimumPrice) {
        couponDiscount = coupon.offerPrice;
        effectiveCouponCode = coupon.name;
        couponApplied = true;
        console.log('placeorder: Coupon applied', { couponCode: effectiveCouponCode, couponDiscount });
      } else {
        effectiveCouponCode = null;
        couponApplied = false;
        req.session.appliedCoupon = null;
      }
    }

    // Check for existing orders
    const existingOrders = await Order.find({ orderId: sharedOrderId, userId });
    const hasNonFailedOrders = existingOrders.some((order) => order.status !== 'failed');

    if (hasNonFailedOrders) {
      return res.status(400).json({
        success: false,
        message: 'Order has already been placed successfully and cannot be retried.',
        redirect: `/order-confirmation/${sharedOrderId}`,
      });
    }

    const existingFailedOrders = existingOrders.filter((order) => order.status === 'failed');

    // Validate stock
    for (const item of cart.cart) {
      if (!item.productId) continue;
      if (item.productId.quantity < item.quantity) {
        req.session.retryOrderId = null;
        return res.status(400).json({
          success: false,
          message: `Product ${item.productId.productName} is out of stock.`,
          redirect: `/order-failed/${sharedOrderId}`,
        });
      }
    }

    // Handle Wallet Payment
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        return res.status(400).json({
          success: false,
          message: 'Wallet not found. Please add funds or choose another payment method.',
          redirect: `/order-failed/${sharedOrderId}`,
        });
      }

      if (wallet.balance < totalAmount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance. Please add funds or choose another payment method.',
          redirect: `/order-failed/${sharedOrderId}`,
        });
      }

      // Validate cart consistency for retries
      if (existingFailedOrders.length > 0) {
        for (const order of existingFailedOrders) {
          const cartItem = cart.cart.find((item) => item.productId._id.toString() === order.product.toString());
          if (!cartItem || cartItem.quantity !== order.quantity) {
            req.session.retryOrderId = null;
            return res.status(400).json({
              success: false,
              message: `Cart mismatch for product ${order.productName}. Please retry from the original order.`,
              redirect: `/order-failed/${sharedOrderId}`,
            });
          }
        }
      }

      // Deduct wallet balance
      const walletUpdate = await Wallet.findOneAndUpdate(
        { userId, balance: { $gte: totalAmount } },
        {
          $inc: { balance: -totalAmount },
          $push: {
            transactions: {
              type: 'Debit',
              amount: totalAmount,
              description: `Payment for order #${sharedOrderId}`,
              status: 'Completed',
            },
          },
        },
        { new: true }
      );

      if (!walletUpdate) {
        return res.status(400).json({
          success: false,
          message: 'Failed to deduct wallet balance. Insufficient funds or wallet error.',
          redirect: `/order-failed/${sharedOrderId}`,
        });
      }
    }

    // Handle Razorpay Payment
    // if (paymentMethod === 'RazorPay' && !razorpayPaymentId && !razorpay_signature) {
    //   if (existingFailedOrders.length > 0) {
    //     for (const order of existingFailedOrders) {
    //       const cartItem = cart.cart.find((item) => item.productId._id.toString() === order.product.toString());
    //       if (!cartItem || cartItem.quantity !== order.quantity) {
    //         req.session.retryOrderId = null;
    //         return res.status(400).json({
    //           success: false,
    //           message: `Cart mismatch for product ${order.productName}. Please retry from the original order.`,
    //           redirect: `/order-failed/${sharedOrderId}`,
    //         });
    //       }
    //     }
    //   }

    //   // Create new Razorpay order
    //   const uuid = uuidv4().replace(/-/g, '');
    //   const receipt = `rcpt_${uuid.substring(0, 36)}`;
    //   const razorpayOrder = await rzp.orders.create({
    //     amount: Math.round(totalAmount * 100),
    //     currency: 'INR',
    //     receipt,
    //   });

    //   return res.status(200).json({
    //     success: true,
    //     order: {
    //       id: razorpayOrder.id,
    //       amount: razorpayOrder.amount,
    //       currency: razorpayOrder.currency,
    //     },
    //     orderId: razorpayOrder.id,
    //   });
    // }

if (paymentMethod === 'RazorPay' && !razorpayPaymentId && !razorpay_signature) {
  if (existingFailedOrders.length > 0) {
    for (const order of existingFailedOrders) {
      order.status = 'failed';
      order.paymentMethod = 'RazorPay';
      order.invoiceDate = new Date();
      await order.save();
    }
    console.log('placeorder: Updated existing failed orders', { sharedOrderId, orders: existingFailedOrders });
  } else {
    const failedOrders = [];
    for (const item of cart.cart) {
      if (!item.productId) continue;
      const itemTotalPrice = item.productId.salePrice * item.quantity;
      const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
      const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
      const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
      const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length);
      const failedOrder = new Order({
        orderId: sharedOrderId,
        userId,
        product: item.productId._id,
        productName: item.productId.productName,
        productImages: item.productId.productImage || [],
        quantity: item.quantity,
        price: item.productId.salePrice,
        totalPrice: itemTotalPrice,
        discount: itemDiscount + itemCouponDiscount,
        discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
        finalAmount,
        address: selectedAddressData,
        invoiceDate: new Date(),
        status: 'failed',
        paymentMethod: 'RazorPay',
        couponApplied: !!effectiveCouponCode,
        couponCode: effectiveCouponCode,
      });
      failedOrders.push(failedOrder);
    }
    const savedOrders = await Order.insertMany(failedOrders);
    console.log('placeorder: Failed orders saved', { sharedOrderId, savedOrders });
  }
  req.session.retryOrderId = null;
  return res.status(400).json({
    success: false,
    message: 'Payment failed or cancelled.',
    redirect: `/order-failed/${sharedOrderId}`
  });
}


    // Validate Razorpay payment
    if (paymentMethod === 'RazorPay' && razorpayPaymentId && razorpay_signature) {
      const crypto = require('crypto');
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment signature.',
          redirect: `/order-failed/${sharedOrderId}`,
        });
      }
    }

    // Create orders
    const orders = cart.cart.map((item) => {
      // Log product data to debug images
      console.log('Product data:', {
        productId: item.productId._id,
        productName: item.productId.productName,
        images: item.productId.images || item.productId.productImage || [],
      });

      return {
        orderId: sharedOrderId,
        userId,
        product: item.productId._id,
        productName: item.productId.productName,
        productImages: item.productId.images || item.productId.productImage || [], // Adjust based on Product schema
        quantity: item.quantity,
        price: item.productId.salePrice,
        totalPrice: item.productId.salePrice * item.quantity,
        discount: baseDiscount / cart.cart.length,
        discountedPrice: (item.productId.salePrice * item.quantity) - (baseDiscount / cart.cart.length),
        finalAmount: (totalPrice - baseDiscount - couponDiscount + gst + shippingCharge) / cart.cart.length,
        address,
        paymentMethod,
        paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Completed',
        razorpayOrderId: paymentMethod === 'RazorPay' ? razorpayOrderId : undefined,
        razorpayPaymentId: paymentMethod === 'RazorPay' ? razorpayPaymentId : undefined,
        status: paymentMethod === 'COD' ? 'pending' : 'confirmed', // COD: pending, Razorpay/Wallet: confirmed
        couponCode: effectiveCouponCode || undefined,
        couponApplied: couponApplied,
        invoiceDate: new Date(),
        stockRestored: false,
      };
    });

    // Log orders before creation
    console.log('Orders to be created:', orders);

    // Delete existing failed orders
    if (existingFailedOrders.length > 0) {
      await Order.deleteMany({ orderId: sharedOrderId, userId, status: 'failed' });
    }

    // Save new orders
    await Order.insertMany(orders);
    console.log('Orders created successfully with status:', orders.map((o) => o.status));

    // Update product quantities
    for (const item of cart.cart) {
      await Product.findByIdAndUpdate(item.productId._id, {
        $inc: { quantity: -item.quantity },
      });
    }

    // Update coupon usage
    if (effectiveCouponCode) {
      await Coupon.findOneAndUpdate(
        { name: effectiveCouponCode },
        { $addToSet: { usedBy: userId } }
      );
      req.session.appliedCoupon = null;
    }

    // Clear cart
    await Cart.findOneAndUpdate({ userId }, { $set: { cart: [] } });

    // Clear retry session
    req.session.retryOrderId = null;

    return res.status(200).json({
      success: true,
      message: 'Order placed successfully.',
      orderId: sharedOrderId,
      redirect: `/order-confirmation/${sharedOrderId}`,
    });
  } catch (error) {
    console.error('Error placing order:', error);
    req.session.retryOrderId = sharedOrderId;
    return res.status(500).json({
      success: false,
      message: 'Failed to place order.',
      redirect: `/order-failed/${sharedOrderId}`,
    });
  }
};






const loadOrderFailed = async (req, res) => {
    const { orderId } = req.params;
    const userId = req.session.user;
    try {
        if (!userId) {
            return res.status(401).render('order-failed', {
                orders: [],
                totalPrice: 0,
                discount: 0,
                couponDiscount: 0,
                gst: 0,
                shippingCharge: 20,
                finalPrice: 0,
                message: 'Please log in to view this page.',
            });
        }

        const orders = await Order.find({
            orderId,
            userId: new mongoose.Types.ObjectId(userId),
            status: 'failed',
        }).populate('product');

        if (!orders || orders.length === 0) {
            return res.status(404).render('page-404', {
                message: 'No failed orders found for this order ID.',
            });
        }

        const totalPrice = orders.reduce((sum, order) => sum + order.totalPrice, 0);
        const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
        let couponDiscount = 0;
        const gst = totalPrice > 2000 ? 10 : 0;
        const shippingCharge = 20;

        if (orders[0].couponApplied && orders[0].couponCode) {
            const coupon = await Coupon.findOne({ name: orders[0].couponCode });
            if (coupon && totalPrice >= coupon.minimumPrice) {
                couponDiscount = coupon.offerPrice;
            }
        }

        const finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

        res.render('order-failed', {
            orders,
            totalPrice,
            discount,
            couponDiscount,
            gst,
            shippingCharge,
            finalPrice,
            message: 'Payment failed. Please try again or choose a different payment method.',
        });
    } catch (err) {
        console.error('Error loading order failure page:', err);
        res.status(500).render('user/500', {
            message: 'Something went wrong while loading the failure page.',
        });
    }
};

const getOrderConfirmation = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.orderId.trim();

    if (!userId) {
      return res.render('order-confirmation', {
        orderId: null,
        orders: [],
        address: null,
        paymentMethod: null,
        totalAmount: 0,
        totalPrice: 0,
        discount: 0,
        couponDiscount: 0,
        gst: 0,
        shippingCharge: 20,
        error: 'Please log in to view order confirmation.',
      });
    }

    const orders = await Order.find({ userId, orderId }).lean();
    if (!orders || orders.length === 0) {
      console.error('getOrderConfirmation: Orders not found', { userId, orderId });
      return res.render('order-confirmation', {
        orderId,
        orders: [],
        address: null,
        paymentMethod: null,
        totalAmount: 0,
        totalPrice: 0,
        discount: 0,
        couponDiscount: 0,
        gst: 0,
        shippingCharge: 20,
        error: `Order not found for Order ID: ${orderId}. Please check your order details.`,
      });
    }

    const totalPrice = orders.reduce((sum, order) => sum + order.totalPrice, 0);
    const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
    const gst = totalPrice > 2000 ? 10 : 0;
    const shippingCharge = 20;
    let couponDiscount = 0;

    if (orders[0].couponApplied && orders[0].couponCode) {
      const coupon = await Coupon.findOne({ name: orders[0].couponCode });
      if (coupon) {
        couponDiscount = coupon.offerPrice;
        console.log('getOrderConfirmation: Coupon found', { couponCode: orders[0].couponCode, couponDiscount });
      } else {
        console.error('getOrderConfirmation: Coupon not found', { couponCode: orders[0].couponCode });
      }
    }

    const totalAmount = totalPrice - discount - couponDiscount + gst + shippingCharge;
    const address = orders[0].address;
    const paymentMethod = orders[0].paymentMethod;

    res.render('order-confirmation', {
      orderId,
      orders,
      address,
      paymentMethod,
      totalAmount,
      totalPrice,
      discount,
      couponDiscount,
      gst,
      shippingCharge,
      error: null,
    });
  } catch (error) {
    console.error('Error fetching order confirmation:', error);
    res.render('order-confirmation', {
      orderId: null,
      orders: [],
      address: null,
      paymentMethod: null,
      totalAmount: 0,
      totalPrice: 0,
      discount: 0,
      couponDiscount: 0,
      gst: 0,
      shippingCharge: 20,
      error: 'Failed to load order confirmation.',
    });
  }
};

const getOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.render('orders', {
        groupedOrders: [],
        error: 'Please log in to view your orders.',
        currentPage: 1,
        totalPages: 1,
        limit: 5,
        search: '',
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    let query = { userId };
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
      ];
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).lean();

    if (!orders || orders.length === 0) {
      return res.render('orders', {
        groupedOrders: [],
        error: search ? 'No orders found matching your search.' : 'You have no orders yet.',
        currentPage: page,
        totalPages: 1,
        limit,
        search,
      });
    }

    const groupedOrders = {};
    orders.forEach(order => {
      if (!groupedOrders[order.orderId]) {
        groupedOrders[order.orderId] = [];
      }
      groupedOrders[order.orderId].push(order);
    });

    const groupedOrdersArray = Object.values(groupedOrders);
    const totalOrders = groupedOrdersArray.length;
    const totalPages = Math.ceil(totalOrders / limit);

    const paginatedGroups = groupedOrdersArray.slice(skip, skip + limit);

    if (!paginatedGroups.length) {
      return res.render('orders', {
        groupedOrders: [],
        error: search ? 'No orders found matching your search.' : 'You have no orders yet.',
        currentPage: page,
        totalPages: 1,
        limit,
        search,
      });
    }

    return res.render('orders', {
      groupedOrders: paginatedGroups,
      error: null,
      currentPage: page,
      totalPages,
      limit,
      search,
    });
  } catch (error) {
    console.error('Error fetching orders:', error.stack);
    res.render('orders', {
      groupedOrders: [],
      error: 'Failed to load your orders. Please try again.',
      currentPage: 1,
      totalPages: 1,
      limit: 5,
      search: '',
    });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.orderId.trim();

    if (!userId) {
      return res.render('order-details', {
        orders: [],
        discount: 0,
        couponDiscount: 0,
        gst: 0,
        shippingCharge: 20,
        message: 'Please log in to view order details.',
      });
    }

    const orders = await Order.find({ userId, orderId }).lean();

    if (!orders || orders.length === 0) {
      return res.render('order-details', {
        orders: [],
        discount: 0,
        couponDiscount: 0,
        gst: 0,
        shippingCharge: 20,
        message: 'Order not found.',
      });
    }

    const totalPrice = orders.reduce((sum, order) => sum + order.totalPrice, 0);
    const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
    const gst = totalPrice > 2000 ? 10 : 0;
    const shippingCharge = 20;
    let couponDiscount = 0;

    if (orders[0].couponApplied && orders[0].couponCode) {
      const coupon = await Coupon.findOne({ name: orders[0].couponCode });
      if (coupon) {
        couponDiscount = coupon.offerPrice;
      }
    }

    res.render('order-details', {
      orders,
      discount,
      couponDiscount,
      gst,
      shippingCharge,
      message: null
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.render('order-details', {
      orders: [],
      discount: 0,
      couponDiscount: 0,
      gst: 0,
      shippingCharge: 20,
      message: 'Failed to load order details. Please try again.',
    });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId, cancelReason } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
    }

    if (!orderId || !cancelReason) {
      return res.status(400).json({ success: false, message: 'Order ID and cancellation reason are required' });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or you do not own this order' });
    }

    if (
      ['delivered', 'cancelled', 'returned', 'return request'].includes(order.status)
    ) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled in its current status' });
    }

    const product = await Product.findById(order.product);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.quantity += order.quantity;
    await product.save();

    order.status = 'cancelled';
    order.cancelReason = cancelReason;
    order.cancelledOn = new Date();
    await order.save();

    if (order.paymentMethod !== 'COD') {
      const wallet = await Wallet.findOneAndUpdate(
        { userId },
        {
          $inc: { balance: order.finalAmount },
          $push: {
            transactions: {
              type: 'Credit',
              amount: order.finalAmount,
              description: `Refund for order #${order.orderId} cancellation`,
              status: 'Completed',
            },
          },
        },
        { upsert: true, new: true }
      );

      if (!wallet) {
        console.error('Failed to update wallet for user:', userId);
        return res.status(500).json({ success: false, message: 'Failed to process refund to wallet' });
      }
    }

    return res.json({ success: true, message: 'Order cancelled successfully', redirect: '/orders' });

  } catch (error) {
    console.error('Error cancelling order:', error.stack);
    res.status(500).json({ success: false, message: 'Server error: Failed to cancel order' });
  }
};

const cancelAllOrders = async (req, res) => {
  try {
    const { orderId, cancelReason } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
    }

    if (!orderId || !cancelReason) {
      return res.status(400).json({ success: false, message: 'Order ID and cancellation reason are required' });
    }

    const orders = await Order.find({ orderId, userId });
    if (!orders || orders.length === 0) {
      return res.status(404).json({ success: false, message: 'No orders found for this order ID' });
    }

    let allCancellable = true;
    for (const order of orders) {
      if (['delivered', 'cancelled', 'returned', 'return request'].includes(order.status)) {
        allCancellable = false;
        break;
      }
    }

    if (!allCancellable) {
      return res.status(400).json({ success: false, message: 'Some orders cannot be cancelled due to their current status' });
    }

    let totalRefund = 0;
    for (const order of orders) {
      const product = await Product.findById(order.product);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product not found for order ${order._id}` });
      }

      product.quantity += order.quantity;
      await product.save();

      order.status = 'cancelled';
      order.cancelReason = cancelReason;
      order.cancelledOn = new Date();
      await order.save();

      if (order.paymentMethod !== 'COD') {
        totalRefund += order.finalAmount;
      }
    }

    if (totalRefund > 0) {
      const wallet = await Wallet.findOneAndUpdate(
        { userId },
        {
          $inc: { balance: totalRefund },
          $push: {
            transactions: {
              type: 'Credit',
              amount: totalRefund,
              description: `Refund for order #${orderId} cancellation`,
              status: 'Completed',
            },
          },
        },
        { upsert: true, new: true }
      );

      if (!wallet) {
        console.error('Failed to update wallet for user:', userId);
        return res.status(500).json({ success: false, message: 'Failed to process refund to wallet' });
      }
    }

    return res.json({ success: true, message: 'All orders cancelled successfully', redirect: '/orders' });

  } catch (error) {
    console.error('Error cancelling all orders:', error.stack);
    res.status(500).json({ success: false, message: 'Server error: Failed to cancel all orders' });
  }
};

const returnOrder = async (req, res) => {
  try {
    const { orderId, returnReason } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
    }

    if (!orderId || !returnReason) {
      return res.status(400).json({ success: false, message: 'Order ID and return reason are required' });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or you do not own this order' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    }

    const deliveredOn = new Date(order.deliveredOn);
    const now = new Date();
    const daysSinceDelivery = (now - deliveredOn) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > 30) {
      return res.status(400).json({ success: false, message: 'Return period has expired (30 days)' });
    }

    order.status = 'return request';
    order.returnReason = returnReason;
    order.returnedOn = new Date();
    await order.save();

    const product = await Product.findById(order.product);
    if (product) {
      await product.save();
    }

    res.json({ success: true, message: 'Return request submitted successfully', redirect: '/orders' });

  } catch (error) {
    console.error('Error submitting return request:', error.stack);
    res.status(500).json({ success: false, message: 'Server error: Failed to submit return request' });
  }
};

const newaddress = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated',
            });
        }

        const { addressType, name, city, landMark, state, pincode, phone, altPhone, isPrimary } = req.body;

        if (!name || !city || !landMark || !state || !pincode || !phone) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be filled',
            });
        }

        const newAddressData = {
            addressType,
            name,
            city,
            landMark,
            state,
            pincode,
            phone,
            altPhone: altPhone || '',
            isPrimary: !!isPrimary
        };

        let useraddress = await Address.findOne({ userId });

        if (useraddress) {
            if (isPrimary) {
                useraddress.address.forEach(addr => (addr.isPrimary = false));
            }
            useraddress.address.push(newAddressData);
            await useraddress.save();
        } else {
            const newAddress = new Address({
                userId,
                address: [newAddressData]
            });
            await newAddress.save();
        }

        res.redirect('/checkout');
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while adding the address',
        });
    }
};

const editAddressCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const addressId = req.params.id;
        const addressData = {
            addressType: req.body.addressType || '',
            name: req.body.name,
            city: req.body.city,
            landMark: req.body.landMark,
            state: req.body.state,
            pincode: req.body.pincode,
            phone: req.body.phone,
            altPhone: req.body.altPhone || '',
            isPrimary: req.body.isPrimary === 'true' || req.body.isPrimary === true
        };

        if (!addressData.name || !addressData.city || !addressData.landMark || !addressData.state || !addressData.pincode || !addressData.phone) {
            return res.status(400).json({ success: false, message: 'All required fields must be filled' });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ success: false, message: 'Address document not found' });
        }

        const address = addressDoc.address.id(addressId);
        if (!address) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }

        if (addressData.isPrimary) {
            addressDoc.address.forEach(addr => (addr.isPrimary = false));
        }

        address.set(addressData);
        await addressDoc.save();

        res.redirect('/checkout');
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({ success: false, message: 'Error updating address' });
    }
};

const loadAboutPage = (req, res) => {
  res.render('orders');
};

const generateInvoice = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.query.orderId;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).send("Order not found");
    }
    if (order.status !== "delivered") {
      return res.status(400).send("Invoice is only available for delivered orders");
    }
    if (!order.invoiceDate) {
      order.invoiceDate = new Date();
      await order.save();
    }

    const templatePath = path.join(__dirname, "../../views/user/invoice-template.ejs");
    const html = await ejs.renderFile(templatePath, { order });

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle0" });

    const invoiceDir = path.join(__dirname, "../../public/invoices");
    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    const fileName = `invoice-${order.orderId}.pdf`;
    const filePath = path.join(invoiceDir, fileName);

    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        right: "20px",
        bottom: "20px",
        left: "20px",
      },
    });

    await browser.close();

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("Error sending file:", err);
        res.status(500).send("Error generating invoice");
      }
    });
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).send("Error generating invoice");
  }
};

const getCartTotal = async (req, res) => {
    const userId = req.session.user;

    try {
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please login to view cart.' });
        }

        const cart = await Cart.findOne({ userId }).populate('cart.productId');
        if (!cart || cart.cart.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty.' });
        }

        let totalPrice = 0;
        for (const item of cart.cart) {
            if (item.productId) {
                totalPrice += item.productId.salePrice * item.quantity;
            }
        }

        console.log('getCartTotal: Calculated total', { userId, totalPrice });

        return res.status(200).json({
            success: true,
            totalPrice,
        });
    } catch (error) {
        console.error('getCartTotal: Error calculating total:', error);
        return res.status(500).json({ success: false, message: 'Failed to calculate cart total.' });
    }
};


const getWalletBalance = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in.' });
    }
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(200).json({ success: true, balance: 0 });
    }
    return res.status(200).json({ success: true, balance: wallet.balance });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch wallet balance.' });
  }
};

const retryOrderCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.orderId.trim();

    if (!userId) {
      return res.render('checkout', {
        cart: null,
        addresses: [],
        totalPrice: 0,
        discount: 0,
        couponDiscount: 0,
        gst: 0,
        shippingCharge: 20,
        finalPrice: 0,
        coupons: [],
        appliedCoupon: null,
        error: 'Please log in to access checkout.',
        outOfStockProducts: [],
      });
    }

    const orders = await Order.find({ orderId, userId, status: 'failed' }).populate('product');
    if (!orders || orders.length === 0) {
      const existingOrders = await Order.find({ orderId, userId });
      if (existingOrders.some(order => order.status !== 'failed')) {
        return res.render('order-confirmation', {
          orderId,
          orders: existingOrders,
          address: existingOrders[0]?.address || null,
          paymentMethod: existingOrders[0]?.paymentMethod || null,
          totalAmount: existingOrders.reduce((sum, item) => sum + (item.finalAmount || 0), 0),
          totalPrice: existingOrders.reduce((sum, item) => sum + (item.totalPrice || 0), 0),
          discount: existingOrders.reduce((sum, item) => sum + (item.discount || 0), 0),
          couponDiscount: existingOrders.reduce((sum, item) => sum + (item.discount || 0) * (item.couponApplied ? 1 : 0), 0),
          gst: existingOrders.reduce((sum, item) => sum + (item.totalPrice || 0), 0) > 2000 ? 10 : 0,
          shippingCharge: 20,
          error: 'Order has already been placed successfully.',
        });
      }
      return res.render('checkout', {
        cart: null,
        addresses: [],
        totalPrice: 0,
        discount: 0,
        couponDiscount: 0,
        gst: 0,
        shippingCharge: 20,
        finalPrice: 0,
        coupons: [],
        appliedCoupon: null,
        error: 'No failed orders found for this order ID.',
        outOfStockProducts: [],
      });
    }

    const addresses = await Address.find({ userId });
    const currentDate = new Date();
    const coupons = await Coupon.find({
      isList: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
      $or: [
        { userId: { $size: 0 } },
        { userId: new mongoose.Types.ObjectId(userId) }
      ],
      usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
    });

    // Reconstruct cart from failed orders
    const cartItems = orders.map(order => ({
      productId: order.product,
      quantity: order.quantity,
    }));

    // Check stock availability
    const outOfStockProducts = [];
    for (const order of orders) {
      if (order.product.quantity < order.quantity) {
        outOfStockProducts.push({ productId: order.product, quantity: order.quantity });
      }
    }

    if (outOfStockProducts.length > 0) {
      return res.render('checkout', {
        cart: null,
        addresses: addresses.map(addr => addr.address).flat(),
        totalPrice: 0,
        discount: 0,
        couponDiscount: 0,
        gst: 0,
        shippingCharge: 20,
        finalPrice: 0,
        coupons,
        appliedCoupon: null,
        error: `Some products are out of stock: ${outOfStockProducts.map(item => item.productId.productName).join(', ')}.`,
        outOfStockProducts,
      });
    }

    const totalPrice = orders.reduce((sum, order) => sum + (order.price * order.quantity), 0);
    const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
    const gst = totalPrice > 2000 ? 10 : 0;
    const shippingCharge = 20;
    let couponDiscount = 0;

    // Reapply coupon from failed order if it was used and still valid
    if (orders[0].couponApplied && orders[0].couponCode) {
      const coupon = await Coupon.findOne({
        name: orders[0].couponCode,
        isList: true,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate },
        usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
      });
      if (coupon && totalPrice >= coupon.minimumPrice) {
        couponDiscount = coupon.offerPrice;
        req.session.appliedCoupon = {
          name: coupon.name,
          offerPrice: coupon.offerPrice,
          minimumPrice: coupon.minimumPrice,
        };
      }
    }

    const finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

    // Update the cart with the failed orders' products
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { cart: cartItems } },
      { upsert: true }
    );

    // Store the original orderId in the session for use in placeorder
    req.session.retryOrderId = orderId;

    res.render('checkout', {
      cart: cartItems,
      addresses: addresses.map(addr => addr.address).flat(),
      totalPrice,
      discount,
      couponDiscount,
      gst,
      shippingCharge,
      finalPrice,
      coupons,
      appliedCoupon: req.session.appliedCoupon || null,
      error: null,
      outOfStockProducts: [],
    });
  } catch (error) {
    console.error('Error loading retry order checkout:', error);
    res.render('checkout', {
      cart: null,
      addresses: [],
      totalPrice: 0,
      discount: 0,
      couponDiscount: 0,
      gst: 0,
      shippingCharge: 20,
      finalPrice: 0,
      coupons: [],
      appliedCoupon: null,
      error: 'Failed to load checkout for retry.',
      outOfStockProducts: [],
    });
  }
};


module.exports = {
  placeorder,
  loadcheckout,
  applyCoupon,
  removeCoupon,
  createRazorpay,
  loadOrderFailed,
  getOrderConfirmation,
  getOrders,
  getOrderDetails,
  cancelOrder,
  cancelAllOrders,
  returnOrder,
  newaddress,
  editAddressCheckout,
  loadAboutPage,
  generateInvoice,
  getCartTotal,
  getWalletBalance,
  retryOrderCheckout
};









// const User = require('../../models/userSchema');
// const Product = require('../../models/productSchema');
// const Cart = require('../../models/cartSchema');
// const Category = require('../../models/categorySchema');
// const Address = require('../../models/addressSchema');
// const Order = require('../../models/orderSchema');
// const Coupon = require('../../models/couponSchema');
// const Wallet = require('../../models/walletSchema');
// const { v4: uuidv4 } = require('uuid');
// const puppeteer = require('puppeteer');
// const path = require('path');
// const ejs = require('ejs');
// const fs = require('fs');
// const mongoose = require('mongoose');
// const Razorpay = require('razorpay');

// // Initialize Razorpay
// const rzp = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID,
//     key_secret: process.env.RAZORPAY_KEY_SECRET
// });

// const loadcheckout = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     if (!userId) {
//       return res.render('checkout', {
//         cart: null,
//         addresses: [],
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons: [],
//         appliedCoupon: null,
//         error: 'Please log in to access checkout.',
//         outOfStockProducts: [],
//       });
//     }

//     const cart = await Cart.findOne({ userId }).populate('cart.productId');
//     const addresses = await Address.find({ userId });

//     const currentDate = new Date();
//     const coupons = await Coupon.find({
//       isList: true,
//       startDate: { $lte: currentDate },
//       endDate: { $gte: currentDate },
//       $or: [
//         { userId: { $size: 0 } },
//         { userId: new mongoose.Types.ObjectId(userId) }
//       ],
//       usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
//     });

//     if (!cart || !cart.cart.length) {
//       return res.render('checkout', {
//         cart: null,
//         addresses: addresses.map(addr => addr.address).flat(),
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons,
//         appliedCoupon: req.session.appliedCoupon || null,
//         error: 'Your cart is empty.',
//         outOfStockProducts: [],
//       });
//     }

//     const outOfStockProducts = cart.cart.filter(item => item.productId.quantity <= 0);
//     let totalPrice = cart.cart.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
//     let discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     let gst = totalPrice > 2000 ? 10 : 0;
//     let shippingCharge = 20;
//     let couponDiscount = req.session.appliedCoupon ? req.session.appliedCoupon.offerPrice : 0;
//     let finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

//     if (outOfStockProducts.length > 0) {
//       await Cart.updateOne(
//         { userId },
//         { $pull: { cart: { productId: { $in: outOfStockProducts.map(item => item.productId._id) } } } }
//       );
//       const updatedCart = await Cart.findOne({ userId }).populate('cart.productId');
//       const validItems = updatedCart ? updatedCart.cart.filter(item => item.productId.quantity > 0) : [];
//       totalPrice = validItems.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
//       discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//       gst = totalPrice > 2000 ? 10 : 0;
//       couponDiscount = req.session.appliedCoupon ? req.session.appliedCoupon.offerPrice : 0;
//       shippingCharge = 20;
//       finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

//       return res.render('checkout', {
//         cart: validItems,
//         addresses: addresses.map(addr => addr.address).flat(),
//         totalPrice,
//         discount,
//         couponDiscount,
//         gst,
//         shippingCharge,
//         finalPrice,
//         coupons,
//         appliedCoupon: req.session.appliedCoupon || null,
//         error: 'Some products were out of stock and removed from your cart.',
//         outOfStockProducts,
//       });
//     }

//     res.render('checkout', {
//       cart: cart.cart.filter(item => item.productId.quantity > 0),
//       addresses: addresses.map(addr => addr.address).flat(),
//       totalPrice,
//       discount,
//       couponDiscount,
//       gst,
//       shippingCharge,
//       finalPrice,
//       coupons,
//       appliedCoupon: req.session.appliedCoupon || null,
//       error: null,
//       outOfStockProducts: [],
//     });
//   } catch (error) {
//     console.error('Error loading checkout page:', error);
//     res.render('checkout', {
//       cart: null,
//       addresses: [],
//       totalPrice: 0,
//       discount: 0,
//       couponDiscount: 0,
//       gst: 0,
//       shippingCharge: 20,
//       finalPrice: 0,
//       coupons: [],
//       appliedCoupon: null,
//       error: 'Failed to load checkout page.',
//       outOfStockProducts: [],
//     });
//   }
// };

// const applyCoupon = async (req, res) => {
//   try {
//     const { couponCode, cartTotal } = req.body;
//     const userId = req.session.user;
//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Please log in to apply a coupon.' });
//     }

//     const coupon = await Coupon.findOne({
//       name: couponCode.toUpperCase(),
//       isList: true,
//       startDate: { $lte: new Date() },
//       endDate: { $gte: new Date() },
//       $or: [
//         { userId: { $size: 0 } },
//         { userId: new mongoose.Types.ObjectId(userId) }
//       ],
//       usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
//     });

//     if (!coupon) {
//       return res.status(400).json({ success: false, message: 'Invalid, expired, or already used coupon.' });
//     }

//     if (cartTotal < coupon.minimumPrice) {
//       return res.status(400).json({ success: false, message: `Minimum purchase amount is ₹${coupon.minimumPrice}.` });
//     }

//     req.session.appliedCoupon = {
//       name: coupon.name,
//       offerPrice: coupon.offerPrice,
//       minimumPrice: coupon.minimumPrice
//     };

//     const discount = cartTotal > 1500 ? cartTotal * 0.1 : 0;
//     const gst = cartTotal > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     const finalPrice = cartTotal - discount - coupon.offerPrice + gst + shippingCharge;

//     res.json({
//       success: true,
//       discount,
//       couponDiscount: coupon.offerPrice,
//       finalPrice,
//       coupon: req.session.appliedCoupon,
//       message: 'Coupon applied successfully.'
//     });
//   } catch (error) {
//     console.error('Error applying coupon:', error);
//     res.status(500).json({ success: false, message: 'Failed to apply coupon.' });
//   }
// };

// const removeCoupon = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Please log in to remove coupon.' });
//     }

//     const cart = await Cart.findOne({ userId }).populate('cart.productId');
//     if (!cart || !cart.cart.length) {
//       req.session.appliedCoupon = null;
//       return res.json({
//         success: true,
//         discount: 0,
//         couponDiscount: 0,
//         finalPrice: 0,
//         message: 'Cart is empty.',
//       });
//     }

//     const totalPrice = cart.cart.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
//     const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     const finalPrice = totalPrice - discount + gst + shippingCharge;

//     req.session.appliedCoupon = null;

//     res.json({
//       success: true,
//       discount,
//       couponDiscount: 0,
//       finalPrice,
//       message: 'Coupon removed successfully.',
//     });
//   } catch (error) {
//     console.error('Error removing coupon:', error);
//     res.status(500).json({ success: false, message: 'Failed to remove coupon.' });
//   }
// };

// const createRazorpay = async (req, res) => {
//     const { amount } = req.body;
//     const userId = req.session.user;

//     try {
//         console.log('createRazorpay: Creating order', { userId, amount });

//         const uuid = uuidv4().replace(/-/g, '');
//         const receipt = `rcpt_${uuid.substring(0, 36)}`;
//         console.log('createRazorpay: Generated receipt', { receipt, length: receipt.length });

//         const order = await rzp.orders.create({
//             amount: Math.round(amount * 100),
//             currency: 'INR',
//             receipt: receipt,
//         });

//         console.log('createRazorpay: Razorpay order created', {
//             orderId: order.id,
//             razorpayOrderId: order.id,
//         });

//         return res.status(200).json({
//             success: true,
//             order: {
//                 id: order.id,
//                 amount: order.amount,
//                 currency: order.currency,
//             },
//             orderId: order.id,
//         });
//     } catch (error) {
//         console.error('createRazorpay: Error creating order:', {
//             message: error.message,
//             statusCode: error.statusCode,
//             errorDetails: error.error || error,
//         });
//         return res.status(500).json({
//             success: false,
//             message: error.error?.description || 'Failed to create Razorpay order.',
//         });
//     }
// };

// const placeorder = async (req, res) => {
//   const userId = req.session.user;
//   let {
//     selectedAddress,
//     paymentMethod,
//     couponCode,
//     razorpayPaymentId,
//     totalAmount,
//     orderId: razorpayOrderId,
//     razorpay_signature,
//   } = req.body || {};

//   paymentMethod = Array.isArray(paymentMethod) ? paymentMethod[0] : paymentMethod;
//   totalAmount = Array.isArray(totalAmount) ? parseFloat(totalAmount[0]) : parseFloat(totalAmount);

//   try {
//     console.log('placeorder:', { userId, paymentMethod, totalAmount, couponCode, razorpayOrderId });

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Please login to place order' });
//     }

//     if (!selectedAddress) {
//       return res.status(400).json({ success: false, message: 'Please select a shipping address.' });
//     }

//     const addressDoc = await Address.findOne({ userId, 'address._id': selectedAddress });
//     if (!addressDoc) {
//       return res.status(400).json({ success: false, message: 'Invalid address selected.' });
//     }
//     const selectedAddressData = addressDoc.address.find(addr => addr._id.toString() === selectedAddress);

//     const cart = await Cart.findOne({ userId }).populate('cart.productId');
//     if (!cart || cart.cart.length === 0) {
//       return res.status(400).json({ success: false, message: 'Your cart is empty.' });
//     }

//     if (paymentMethod === 'COD' && totalAmount > 1000) {
//       return res.status(400).json({ success: false, message: 'COD not available for orders above ₹1000.' });
//     }

//     const totalPrice = cart.cart.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
//     const baseDiscount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;

//     let couponDiscount = 0;
//     let effectiveCouponCode = null;
//     // Prioritize coupon from request, then session, then failed order
//     if (couponCode) {
//       effectiveCouponCode = couponCode;
//     } else if (req.session.appliedCoupon?.name) {
//       effectiveCouponCode = req.session.appliedCoupon.name;
//     } else if (req.session.retryOrderId) {
//       const existingFailedOrders = await Order.find({ orderId: req.session.retryOrderId, userId, status: 'failed' });
//       if (existingFailedOrders.length > 0 && existingFailedOrders[0].couponCode) {
//         effectiveCouponCode = existingFailedOrders[0].couponCode;
//       }
//     }

//     if (effectiveCouponCode) {
//       const coupon = await Coupon.findOne({
//         name: effectiveCouponCode,
//         usedBy: { $nin: [userId] },
//         isList: true,
//         startDate: { $lte: new Date() },
//         endDate: { $gte: new Date() }
//       });
//       if (coupon && totalPrice >= coupon.minimumPrice) {
//         couponDiscount = coupon.offerPrice;
//         effectiveCouponCode = coupon.name;
//         console.log('placeorder: Coupon applied', { couponCode: effectiveCouponCode, couponDiscount });
//       } else {
//         effectiveCouponCode = null; // Reset if coupon is invalid
//         req.session.appliedCoupon = null; // Clear invalid session coupon
//       }
//     }

//     // Use retryOrderId from session if available, otherwise use razorpayOrderId or generate new
//     const sharedOrderId = req.session.retryOrderId || razorpayOrderId || uuidv4();

//     // Check for existing orders with the same orderId
//     const existingOrders = await Order.find({ orderId: sharedOrderId, userId });
//     const hasNonFailedOrders = existingOrders.some(order => order.status !== 'failed');

//     if (hasNonFailedOrders) {
//       return res.status(400).json({
//         success: false,
//         message: 'Order has already been placed successfully and cannot be retried.',
//         redirect: `/order-confirmation/${sharedOrderId}`
//       });
//     }

//     const existingFailedOrders = existingOrders.filter(order => order.status === 'failed');

//     if (paymentMethod === 'RazorPay' && !razorpayPaymentId && !razorpay_signature) {
//       if (existingFailedOrders.length > 0) {
//         for (const order of existingFailedOrders) {
//           order.status = 'failed';
//           order.paymentMethod = 'RazorPay';
//           order.invoiceDate = new Date();
//           await order.save();
//         }
//         console.log('placeorder: Updated existing failed orders', { sharedOrderId });
//       } else {
//         const failedOrders = [];
//         for (const item of cart.cart) {
//           if (!item.productId) continue;
//           const itemTotalPrice = item.productId.salePrice * item.quantity;
//           const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
//           const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
//           const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
//           const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length);
//           const failedOrder = new Order({
//             orderId: sharedOrderId,
//             userId,
//             product: item.productId._id,
//             productName: item.productId.productName,
//             productImages: item.productId.productImage || [],
//             quantity: item.quantity,
//             price: item.productId.salePrice,
//             totalPrice: itemTotalPrice,
//             discount: itemDiscount + itemCouponDiscount,
//             discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
//             finalAmount,
//             address: selectedAddressData,
//             invoiceDate: new Date(),
//             status: 'failed',
//             paymentMethod: 'RazorPay',
//             couponApplied: !!effectiveCouponCode,
//             couponCode: effectiveCouponCode,
//           });
//           failedOrders.push(failedOrder);
//         }
//         await Order.insertMany(failedOrders);
//         console.log('placeorder: Failed orders saved', { sharedOrderId });
//       }
//       req.session.retryOrderId = null;
//       return res.status(400).json({
//         success: false,
//         message: 'Payment failed or cancelled.',
//         redirect: `/order-failed/${sharedOrderId}`
//       });
//     }

//     if (paymentMethod === 'RazorPay' && razorpayPaymentId && razorpayOrderId && razorpay_signature) {
//       const crypto = require('crypto');
//       const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
//       const generatedSignature = crypto
//         .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
//         .update(payload)
//         .digest('hex');

//       if (generatedSignature !== razorpay_signature) {
//         if (existingFailedOrders.length > 0) {
//           for (const order of existingFailedOrders) {
//             order.status = 'failed';
//             order.paymentMethod = 'RazorPay';
//             order.invoiceDate = new Date();
//             await order.save();
//           }
//         } else {
//           const failedOrders = [];
//           for (const item of cart.cart) {
//             if (!item.productId) continue;
//             const itemTotalPrice = item.productId.salePrice * item.quantity;
//             const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
//             const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
//             const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
//             const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length);
//             const failedOrder = new Order({
//               orderId: sharedOrderId,
//               userId,
//               product: item.productId._id,
//               productName: item.productId.productName,
//               productImages: item.productId.productImage || [],
//               quantity: item.quantity,
//               price: item.productId.salePrice,
//               totalPrice: itemTotalPrice,
//               discount: itemDiscount + itemCouponDiscount,
//               discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
//               finalAmount,
//               address: selectedAddressData,
//               invoiceDate: new Date(),
//               status: 'failed',
//               paymentMethod: 'RazorPay',
//               couponApplied: !!effectiveCouponCode,
//               couponCode: effectiveCouponCode,
//             });
//             failedOrders.push(failedOrder);
//           }
//           await Order.insertMany(failedOrders);
//         }
//         req.session.retryOrderId = null;
//         return res.status(400).json({
//           success: false,
//           message: 'Invalid payment signature.',
//           redirect: `/order-failed/${sharedOrderId}`
//         });
//       }
//     }

//     // Validate stock before proceeding
//     for (const item of cart.cart) {
//       if (!item.productId) continue;
//       if (item.productId.quantity < item.quantity) {
//         req.session.retryOrderId = null;
//         return res.status(400).json({
//           success: false,
//           message: `Product ${item.productId.productName} is out of stock.`
//         });
//       }
//     }

//     // Update existing failed orders or create new ones
//     if (existingFailedOrders.length > 0) {
//       for (const order of existingFailedOrders) {
//         const cartItem = cart.cart.find(item => item.productId._id.toString() === order.product.toString());
//         if (!cartItem || cartItem.quantity !== order.quantity) {
//           req.session.retryOrderId = null;
//           return res.status(400).json({
//             success: false,
//             message: `Cart mismatch for product ${order.productName}. Please retry from the original order.`
//           });
//         }
//         await Product.findByIdAndUpdate(order.product, {
//           $inc: { quantity: -order.quantity }
//         });
//         order.status = paymentMethod === 'COD' ? 'pending' : 'confirmed';
//         order.paymentMethod = paymentMethod;
//         order.invoiceDate = new Date();
//         order.couponApplied = !!effectiveCouponCode;
//         order.couponCode = effectiveCouponCode;
//         order.discount = baseDiscount > 0 ? (order.totalPrice / totalPrice) * baseDiscount : 0 + (effectiveCouponCode ? (order.totalPrice / totalPrice) * couponDiscount : 0);
//         order.discountedPrice = order.totalPrice - order.discount;
//         order.finalAmount = order.totalPrice - order.discount + (gst > 0 ? (order.totalPrice / totalPrice) * gst : 0) + (shippingCharge / cart.cart.length);
//         await order.save();
//       }
//     } else {
//       const orders = [];
//       let totalOrderAmount = 0;

//       for (const item of cart.cart) {
//         if (!item.productId) continue;
//         const itemTotalPrice = item.productId.salePrice * item.quantity;
//         const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
//         const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
//         const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
//         const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length);

//         const order = new Order({
//           orderId: sharedOrderId,
//           userId,
//           product: item.productId._id,
//           productName: item.productId.productName,
//           productImages: item.productId.productImage || [],
//           quantity: item.quantity,
//           price: item.productId.salePrice,
//           totalPrice: itemTotalPrice,
//           discount: itemDiscount + itemCouponDiscount,
//           discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
//           finalAmount,
//           address: selectedAddressData,
//           invoiceDate: new Date(),
//           status: paymentMethod === 'COD' ? 'pending' : 'confirmed',
//           paymentMethod,
//           couponApplied: !!effectiveCouponCode,
//           couponCode: effectiveCouponCode,
//         });

//         totalOrderAmount += finalAmount;
//         orders.push(order);

//         await Product.findByIdAndUpdate(item.productId._id, {
//           $inc: { quantity: -item.quantity }
//         });
//       }

//       if (!orders.length) {
//         req.session.retryOrderId = null;
//         return res.status(400).json({ success: false, message: 'No valid items in cart.' });
//       }

//       await Order.insertMany(orders);
//     }

//     const expectedTotal = totalPrice - baseDiscount - couponDiscount + gst + shippingCharge;
//     console.log('placeorder: Total check', { totalAmount, expectedTotal });
//     if (totalAmount && Math.abs(totalAmount - expectedTotal) > 0.01) {
//       req.session.retryOrderId = null;
//       return res.status(400).json({
//         success: false,
//         message: `Total amount mismatch. Client: ₹${totalAmount}, Server: ₹${expectedTotal}`
//       });
//     }

//     if (effectiveCouponCode) {
//       await Coupon.findOneAndUpdate(
//         { name: effectiveCouponCode },
//         { $addToSet: { usedBy: userId } }
//       );
//       req.session.appliedCoupon = null; // Clear after successful use
//     }

//     req.session.retryOrderId = null;
//     await Cart.findOneAndUpdate({ userId }, { $set: { cart: [] } });

//     return res.status(200).json({
//       success: true,
//       message: 'Order placed successfully.',
//       redirect: `/order-confirmation/${sharedOrderId}`
//     });
//   } catch (error) {
//     console.error('placeorder error:', error);
//     req.session.retryOrderId = null;
//     const fallbackOrderId = razorpayOrderId || uuidv4();
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to place order.',
//       redirect: `/order-failed/${fallbackOrderId}`
//     });
//   }
// };








// // const placeorder = async (req, res) => {
// //   const userId = req.session.user;
// //   let {
// //     selectedAddress,
// //     paymentMethod,
// //     couponCode,
// //     razorpayPaymentId,
// //     totalAmount,
// //     orderId: razorpayOrderId,
// //     razorpay_signature,
// //   } = req.body || {};

// //   // Normalize inputs
// //   paymentMethod = Array.isArray(paymentMethod) ? paymentMethod[0] : paymentMethod;
// //   totalAmount = Array.isArray(totalAmount) ? parseFloat(totalAmount[0]) : parseFloat(totalAmount);

// //   // Define sharedOrderId early
// //   let sharedOrderId = req.session.retryOrderId || razorpayOrderId || uuidv4();

// //   try {
// //     console.log('placeorder: Input data', {
// //       userId,
// //       paymentMethod,
// //       totalAmount,
// //       couponCode,
// //       razorpayOrderId,
// //       retryOrderId: req.session.retryOrderId,
// //       sessionCoupon: req.session.appliedCoupon,
// //     });

// //     // Validate user
// //     if (!userId) {
// //       return res.status(401).json({
// //         success: false,
// //         message: 'Please login to place order',
// //         redirect: '/login',
// //       });
// //     }

// //     // Validate address
// //     if (!selectedAddress) {
// //       return res.status(400).json({
// //         success: false,
// //         message: 'Please select a shipping address.',
// //         redirect: `/order-failed/${sharedOrderId}`,
// //       });
// //     }

// //     const addressDoc = await Address.findOne({ userId, 'address._id': selectedAddress });
// //     if (!addressDoc) {
// //       return res.status(400).json({
// //         success: false,
// //         message: 'Invalid address selected.',
// //         redirect: `/order-failed/${sharedOrderId}`,
// //       });
// //     }
// //     const selectedAddressData = addressDoc.address.find((addr) => addr._id.toString() === selectedAddress);

// //     const address = {
// //       name: selectedAddressData.name,
// //       phone: selectedAddressData.phone,
// //       pincode: selectedAddressData.pincode,
// //       locality: selectedAddressData.locality || '',
// //       address: selectedAddressData.address || selectedAddressData.landMark || '',
// //       city: selectedAddressData.city,
// //       state: selectedAddressData.state,
// //       landmark: selectedAddressData.landMark || '',
// //       alternatePhone: selectedAddressData.altPhone || '',
// //       addressType: selectedAddressData.addressType || '',
// //     };

// //     // Fetch cart
// //     const cart = await Cart.findOne({ userId }).populate('cart.productId');
// //     if (!cart || cart.cart.length === 0) {
// //       return res.status(400).json({
// //         success: false,
// //         message: 'Your cart is empty.',
// //         redirect: `/order-failed/${sharedOrderId}`,
// //       });
// //     }

// //     // Validate COD limit
// //     if (paymentMethod === 'COD' && totalAmount > 1000) {
// //       return res.status(400).json({
// //         success: false,
// //         message: 'COD not available for orders above ₹1000.',
// //         redirect: `/order-failed/${sharedOrderId}`,
// //       });
// //     }

// //     // Calculate totals
// //     const totalPrice = cart.cart.reduce((sum, item) => sum + item.productId.salePrice * item.quantity, 0);
// //     const baseDiscount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
// //     const gst = totalPrice > 2000 ? 10 : 0;
// //     const shippingCharge = 20;

// //     // Handle coupon
// //     let couponDiscount = 0;
// //     let effectiveCouponCode = null;
// //     let couponApplied = false;

// //     // Determine coupon to use
// //     if (couponCode) {
// //       effectiveCouponCode = couponCode;
// //     } else if (req.session.appliedCoupon?.name) {
// //       effectiveCouponCode = req.session.appliedCoupon.name;
// //     } else if (req.session.retryOrderId) {
// //       const existingFailedOrder = await Order.findOne({ orderId: req.session.retryOrderId, userId, status: 'failed' });
// //       if (existingFailedOrder?.couponCode) {
// //         effectiveCouponCode = existingFailedOrder.couponCode;
// //       }
// //     }

// //     // Validate coupon
// //     if (effectiveCouponCode) {
// //       const coupon = await Coupon.findOne({
// //         name: effectiveCouponCode,
// //         usedBy: { $nin: [userId] },
// //         isList: true,
// //         startDate: { $lte: new Date() },
// //         endDate: { $gte: new Date() },
// //       });
// //       if (coupon && totalPrice >= coupon.minimumPrice) {
// //         couponDiscount = coupon.offerPrice;
// //         couponApplied = true;
// //         req.session.appliedCoupon = {
// //           name: coupon.name,
// //           offerPrice: coupon.offerPrice,
// //           minimumPrice: coupon.minimumPrice,
// //         };
// //         console.log('placeorder: Coupon validated', { couponCode: effectiveCouponCode, couponDiscount });
// //       } else {
// //         console.log('placeorder: Invalid or ineligible coupon', { effectiveCouponCode });
// //         effectiveCouponCode = null;
// //         couponApplied = false;
// //         req.session.appliedCoupon = null;
// //       }
// //     } else {
// //       req.session.appliedCoupon = null;
// //     }

// //     // Check for existing orders
// //     const existingOrders = await Order.find({ orderId: sharedOrderId, userId });
// //     const hasNonFailedOrders = existingOrders.some((order) => order.status !== 'failed');

// //     if (hasNonFailedOrders) {
// //       req.session.retryOrderId = null;
// //       return res.status(400).json({
// //         success: false,
// //         message: 'Order has already been placed successfully and cannot be retried.',
// //         redirect: `/order-confirmation/${sharedOrderId}`,
// //       });
// //     }

// //     const existingFailedOrders = existingOrders.filter((order) => order.status === 'failed');

// //     // Validate stock
// //     for (const item of cart.cart) {
// //       if (!item.productId) continue;
// //       if (item.productId.quantity < item.quantity) {
// //         req.session.retryOrderId = null;
// //         return res.status(400).json({
// //           success: false,
// //           message: `Product ${item.productId.productName} is out of stock.`,
// //           redirect: `/order-failed/${sharedOrderId}`,
// //         });
// //       }
// //     }

// //     // Validate cart consistency for retries
// //     if (existingFailedOrders.length > 0) {
// //       for (const order of existingFailedOrders) {
// //         const cartItem = cart.cart.find((item) => item.productId._id.toString() === order.product.toString());
// //         if (!cartItem || cartItem.quantity !== order.quantity) {
// //           req.session.retryOrderId = null;
// //           return res.status(400).json({
// //             success: false,
// //             message: `Cart mismatch for product ${order.productName}. Please retry from the original order.`,
// //             redirect: `/order-failed/${sharedOrderId}`,
// //           });
// //         }
// //       }
// //     }

// //     // Handle Razorpay retry: Create new Razorpay order if missing
// //     if (paymentMethod === 'RazorPay' && !razorpayOrderId && req.session.retryOrderId) {
// //       console.log('placeorder: Generating new Razorpay order for retry', { sharedOrderId });
// //       const receipt = `rcpt_${uuidv4()}`;
// //       const razorpayOrder = await razorpay.orders.create({
// //         amount: Math.round(totalAmount * 100), // Convert to paise
// //         currency: 'INR',
// //         receipt,
// //       });
// //       razorpayOrderId = razorpayOrder.id;
// //       sharedOrderId = razorpayOrderId; // Update sharedOrderId for consistency
// //       console.log('placeorder: New Razorpay order created', { razorpayOrderId, receipt });
// //     }

// //     // Handle Wallet Payment
// //     if (paymentMethod === 'Wallet') {
// //       const wallet = await Wallet.findOne({ userId });
// //       if (!wallet || wallet.balance < totalAmount) {
// //         return res.status(400).json({
// //           success: false,
// //           message: 'Insufficient wallet balance or wallet not found.',
// //           redirect: `/order-failed/${sharedOrderId}`,
// //         });
// //       }

// //       const walletUpdate = await Wallet.findOneAndUpdate(
// //         { userId, balance: { $gte: totalAmount } },
// //         {
// //           $inc: { balance: -totalAmount },
// //           $push: {
// //             transactions: {
// //               type: 'Debit',
// //               amount: totalAmount,
// //               description: `Payment for order #${sharedOrderId}`,
// //               status: 'Completed',
// //             },
// //           },
// //         },
// //         { new: true }
// //       );

// //       if (!walletUpdate) {
// //         return res.status(400).json({
// //           success: false,
// //           message: 'Failed to deduct wallet balance.',
// //           redirect: `/order-failed/${sharedOrderId}`,
// //         });
// //       }
// //     }

// //     // Handle Razorpay Payment Failure
// //     if (paymentMethod === 'RazorPay' && !razorpayPaymentId && !razorpay_signature) {
// //       console.log('placeorder: Razorpay payment failed or cancelled', { sharedOrderId });

// //       if (existingFailedOrders.length > 0) {
// //         for (const order of existingFailedOrders) {
// //           order.status = 'failed';
// //           order.paymentMethod = 'RazorPay';
// //           order.invoiceDate = new Date();
// //           order.couponApplied = couponApplied;
// //           order.couponCode = effectiveCouponCode || undefined;
// //           order.razorpayOrderId = razorpayOrderId;
// //           await order.save();
// //         }
// //         console.log('placeorder: Updated existing failed orders', { sharedOrderId });
// //       } else {
// //         const failedOrders = cart.cart.map((item) => {
// //           if (!item.productId) return null;
// //           const itemTotalPrice = item.productId.salePrice * item.quantity;
// //           const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
// //           const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
// //           const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
// //           const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length);
// //           return {
// //             orderId: sharedOrderId,
// //             userId,
// //             product: item.productId._id,
// //             productName: item.productId.productName,
// //             productImages: item.productId.productImage || [],
// //             quantity: item.quantity,
// //             price: item.productId.salePrice,
// //             totalPrice: itemTotalPrice,
// //             discount: itemDiscount + itemCouponDiscount,
// //             discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
// //             finalAmount,
// //             address,
// //             invoiceDate: new Date(),
// //             status: 'failed',
// //             paymentMethod: 'RazorPay',
// //             couponApplied,
// //             couponCode: effectiveCouponCode || undefined,
// //             razorpayOrderId,
// //           };
// //         }).filter(Boolean);
// //         await Order.insertMany(failedOrders);
// //         console.log('placeorder: Created new failed orders', { sharedOrderId });
// //       }

// //       req.session.retryOrderId = sharedOrderId;
// //       return res.status(400).json({
// //         success: false,
// //         message: 'Payment failed or cancelled.',
// //         redirect: `/order-failed/${sharedOrderId}`,
// //         razorpayOrderId, // Include for frontend retry
// //       });
// //     }

// //     // Validate Razorpay Payment
// //     if (paymentMethod === 'RazorPay' && razorpayPaymentId && razorpay_signature) {
// //       const crypto = require('crypto');
// //       const generatedSignature = crypto
// //         .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
// //         .update(`${razorpayOrderId}|${razorpayPaymentId}`)
// //         .digest('hex');

// //       if (generatedSignature !== razorpay_signature) {
// //         req.session.retryOrderId = sharedOrderId;
// //         return res.status(400).json({
// //           success: false,
// //           message: 'Invalid payment signature.',
// //           redirect: `/order-failed/${sharedOrderId}`,
// //           razorpayOrderId,
// //         });
// //       }
// //     }

// //     // Create orders
// //     const orders = cart.cart.map((item) => {
// //       if (!item.productId) return null;
// //       const itemTotalPrice = item.productId.salePrice * item.quantity;
// //       const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
// //       const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
// //       const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
// //       return {
// //         orderId: sharedOrderId,
// //         userId,
// //         product: item.productId._id,
// //         productName: item.productId.productName,
// //         productImages: item.productId.productImage || [],
// //         quantity: item.quantity,
// //         price: item.productId.salePrice,
// //         totalPrice: itemTotalPrice,
// //         discount: itemDiscount + itemCouponDiscount,
// //         discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
// //         finalAmount: itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length),
// //         address,
// //         paymentMethod,
// //         paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Completed',
// //         razorpayOrderId: paymentMethod === 'RazorPay' ? razorpayOrderId : undefined,
// //         razorpayPaymentId: paymentMethod === 'RazorPay' ? razorpayPaymentId : undefined,
// //         status: paymentMethod === 'COD' ? 'pending' : 'confirmed',
// //         couponCode: effectiveCouponCode || undefined,
// //         couponApplied,
// //         invoiceDate: new Date(),
// //         stockRestored: false,
// //       };
// //     }).filter(Boolean);

// //     // Delete existing failed orders
// //     if (existingFailedOrders.length > 0) {
// //       await Order.deleteMany({ orderId: sharedOrderId, userId, status: 'failed' });
// //       console.log('placeorder: Deleted existing failed orders', { sharedOrderId });
// //     }

// //     // Save new orders
// //     await Order.insertMany(orders);
// //     console.log('placeorder: Orders created successfully', { sharedOrderId, status: orders.map((o) => o.status) });

// //     // Update product quantities
// //     for (const item of cart.cart) {
// //       if (item.productId) {
// //         await Product.findByIdAndUpdate(item.productId._id, {
// //           $inc: { quantity: -item.quantity },
// //         });
// //       }
// //     }

// //     // Update coupon usage
// //     if (effectiveCouponCode) {
// //       await Coupon.findOneAndUpdate(
// //         { name: effectiveCouponCode },
// //         { $addToSet: { usedBy: userId } }
// //       );
// //     }

// //     // Clear cart
// //     await Cart.findOneAndUpdate({ userId }, { $set: { cart: [] } });

// //     // Clear session
// //     req.session.appliedCoupon = null;
// //     req.session.retryOrderId = null;

// //     return res.status(200).json({
// //       success: true,
// //       message: 'Order placed successfully.',
// //       orderId: sharedOrderId,
// //       redirect: `/order-confirmation/${sharedOrderId}`,
// //     });
// //   } catch (error) {
// //     console.error('placeorder: Error', { error: error.message, stack: error.stack });
// //     req.session.retryOrderId = sharedOrderId;
// //     return res.status(500).json({
// //       success: false,
// //       message: 'Failed to place order.',
// //       redirect: `/order-failed/${sharedOrderId}`,
// //       razorpayOrderId,
// //     });
// //   }
// // };





// const loadOrderFailed = async (req, res) => {
//     const { orderId } = req.params;
//     const userId = req.session.user;
//     try {
//         if (!userId) {
//             return res.status(401).render('order-failed', {
//                 orders: [],
//                 totalPrice: 0,
//                 discount: 0,
//                 couponDiscount: 0,
//                 gst: 0,
//                 shippingCharge: 20,
//                 finalPrice: 0,
//                 message: 'Please log in to view this page.',
//             });
//         }

//         const orders = await Order.find({
//             orderId,
//             userId: new mongoose.Types.ObjectId(userId),
//             status: 'failed',
//         }).populate('product');

//         if (!orders || orders.length === 0) {
//             return res.status(404).render('page-404', {
//                 message: 'No failed orders found for this order ID.',
//             });
//         }

//         const totalPrice = orders.reduce((sum, order) => sum + order.totalPrice, 0);
//         const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//         let couponDiscount = 0;
//         const gst = totalPrice > 2000 ? 10 : 0;
//         const shippingCharge = 20;

//         if (orders[0].couponApplied && orders[0].couponCode) {
//             const coupon = await Coupon.findOne({ name: orders[0].couponCode });
//             if (coupon && totalPrice >= coupon.minimumPrice) {
//                 couponDiscount = coupon.offerPrice;
//             }
//         }

//         const finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

//         res.render('order-failed', {
//             orders,
//             totalPrice,
//             discount,
//             couponDiscount,
//             gst,
//             shippingCharge,
//             finalPrice,
//             message: 'Payment failed. Please try again or choose a different payment method.',
//         });
//     } catch (err) {
//         console.error('Error loading order failure page:', err);
//         res.status(500).render('user/500', {
//             message: 'Something went wrong while loading the failure page.',
//         });
//     }
// };

// const getOrderConfirmation = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const orderId = req.params.orderId.trim();

//     if (!userId) {
//       return res.render('order-confirmation', {
//         orderId: null,
//         orders: [],
//         address: null,
//         paymentMethod: null,
//         totalAmount: 0,
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         error: 'Please log in to view order confirmation.',
//       });
//     }

//     const orders = await Order.find({ userId, orderId }).lean();
//     if (!orders || orders.length === 0) {
//       console.error('getOrderConfirmation: Orders not found', { userId, orderId });
//       return res.render('order-confirmation', {
//         orderId,
//         orders: [],
//         address: null,
//         paymentMethod: null,
//         totalAmount: 0,
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         error: `Order not found for Order ID: ${orderId}. Please check your order details.`,
//       });
//     }

//     const totalPrice = orders.reduce((sum, order) => sum + order.totalPrice, 0);
//     const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     let couponDiscount = 0;

//     if (orders[0].couponApplied && orders[0].couponCode) {
//       const coupon = await Coupon.findOne({ name: orders[0].couponCode });
//       if (coupon) {
//         couponDiscount = coupon.offerPrice;
//         console.log('getOrderConfirmation: Coupon found', { couponCode: orders[0].couponCode, couponDiscount });
//       } else {
//         console.error('getOrderConfirmation: Coupon not found', { couponCode: orders[0].couponCode });
//       }
//     }

//     const totalAmount = totalPrice - discount - couponDiscount + gst + shippingCharge;
//     const address = orders[0].address;
//     const paymentMethod = orders[0].paymentMethod;

//     res.render('order-confirmation', {
//       orderId,
//       orders,
//       address,
//       paymentMethod,
//       totalAmount,
//       totalPrice,
//       discount,
//       couponDiscount,
//       gst,
//       shippingCharge,
//       error: null,
//     });
//   } catch (error) {
//     console.error('Error fetching order confirmation:', error);
//     res.render('order-confirmation', {
//       orderId: null,
//       orders: [],
//       address: null,
//       paymentMethod: null,
//       totalAmount: 0,
//       totalPrice: 0,
//       discount: 0,
//       couponDiscount: 0,
//       gst: 0,
//       shippingCharge: 20,
//       error: 'Failed to load order confirmation.',
//     });
//   }
// };

// const getOrders = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     if (!userId) {
//       return res.render('orders', {
//         groupedOrders: [],
//         error: 'Please log in to view your orders.',
//         currentPage: 1,
//         totalPages: 1,
//         limit: 5,
//         search: '',
//       });
//     }

//     const page = parseInt(req.query.page) || 1;
//     const limit = 5;
//     const skip = (page - 1) * limit;
//     const search = req.query.search || '';

//     let query = { userId };
//     if (search) {
//       query.$or = [
//         { orderId: { $regex: search, $options: 'i' } },
//         { productName: { $regex: search, $options: 'i' } },
//       ];
//     }

//     const orders = await Order.find(query).sort({ createdAt: -1 }).lean();

//     if (!orders || orders.length === 0) {
//       return res.render('orders', {
//         groupedOrders: [],
//         error: search ? 'No orders found matching your search.' : 'You have no orders yet.',
//         currentPage: page,
//         totalPages: 1,
//         limit,
//         search,
//       });
//     }

//     const groupedOrders = {};
//     orders.forEach(order => {
//       if (!groupedOrders[order.orderId]) {
//         groupedOrders[order.orderId] = [];
//       }
//       groupedOrders[order.orderId].push(order);
//     });

//     const groupedOrdersArray = Object.values(groupedOrders);
//     const totalOrders = groupedOrdersArray.length;
//     const totalPages = Math.ceil(totalOrders / limit);

//     const paginatedGroups = groupedOrdersArray.slice(skip, skip + limit);

//     if (!paginatedGroups.length) {
//       return res.render('orders', {
//         groupedOrders: [],
//         error: search ? 'No orders found matching your search.' : 'You have no orders yet.',
//         currentPage: page,
//         totalPages: 1,
//         limit,
//         search,
//       });
//     }

//     return res.render('orders', {
//       groupedOrders: paginatedGroups,
//       error: null,
//       currentPage: page,
//       totalPages,
//       limit,
//       search,
//     });
//   } catch (error) {
//     console.error('Error fetching orders:', error.stack);
//     res.render('orders', {
//       groupedOrders: [],
//       error: 'Failed to load your orders. Please try again.',
//       currentPage: 1,
//       totalPages: 1,
//       limit: 5,
//       search: '',
//     });
//   }
// };

// const getOrderDetails = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const orderId = req.params.orderId.trim();

//     if (!userId) {
//       return res.render('order-details', {
//         orders: [],
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         message: 'Please log in to view order details.',
//       });
//     }

//     const orders = await Order.find({ userId, orderId }).lean();

//     if (!orders || orders.length === 0) {
//       return res.render('order-details', {
//         orders: [],
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         message: 'Order not found.',
//       });
//     }

//     const totalPrice = orders.reduce((sum, order) => sum + order.totalPrice, 0);
//     const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     let couponDiscount = 0;

//     if (orders[0].couponApplied && orders[0].couponCode) {
//       const coupon = await Coupon.findOne({ name: orders[0].couponCode });
//       if (coupon) {
//         couponDiscount = coupon.offerPrice;
//       }
//     }

//     res.render('order-details', {
//       orders,
//       discount,
//       couponDiscount,
//       gst,
//       shippingCharge,
//       message: null
//     });
//   } catch (error) {
//     console.error('Error fetching order details:', error);
//     res.render('order-details', {
//       orders: [],
//       discount: 0,
//       couponDiscount: 0,
//       gst: 0,
//       shippingCharge: 20,
//       message: 'Failed to load order details. Please try again.',
//     });
//   }
// };

// const cancelOrder = async (req, res) => {
//   try {
//     const { orderId, cancelReason } = req.body;
//     const userId = req.session.user;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
//     }

//     if (!orderId || !cancelReason) {
//       return res.status(400).json({ success: false, message: 'Order ID and cancellation reason are required' });
//     }

//     const order = await Order.findOne({ _id: orderId, userId });
//     if (!order) {
//       return res.status(404).json({ success: false, message: 'Order not found or you do not own this order' });
//     }

//     if (
//       ['delivered', 'cancelled', 'returned', 'return request'].includes(order.status)
//     ) {
//       return res.status(400).json({ success: false, message: 'Order cannot be cancelled in its current status' });
//     }

//     const product = await Product.findById(order.product);
//     if (!product) {
//       return res.status(404).json({ success: false, message: 'Product not found' });
//     }

//     product.quantity += order.quantity;
//     await product.save();

//     order.status = 'cancelled';
//     order.cancelReason = cancelReason;
//     order.cancelledOn = new Date();
//     await order.save();

//     if (order.paymentMethod !== 'COD') {
//       const wallet = await Wallet.findOneAndUpdate(
//         { userId },
//         {
//           $inc: { balance: order.finalAmount },
//           $push: {
//             transactions: {
//               type: 'Credit',
//               amount: order.finalAmount,
//               description: `Refund for order #${order.orderId} cancellation`,
//               status: 'Completed',
//             },
//           },
//         },
//         { upsert: true, new: true }
//       );

//       if (!wallet) {
//         console.error('Failed to update wallet for user:', userId);
//         return res.status(500).json({ success: false, message: 'Failed to process refund to wallet' });
//       }
//     }

//     return res.json({ success: true, message: 'Order cancelled successfully', redirect: '/orders' });

//   } catch (error) {
//     console.error('Error cancelling order:', error.stack);
//     res.status(500).json({ success: false, message: 'Server error: Failed to cancel order' });
//   }
// };

// const cancelAllOrders = async (req, res) => {
//   try {
//     const { orderId, cancelReason } = req.body;
//     const userId = req.session.user;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
//     }

//     if (!orderId || !cancelReason) {
//       return res.status(400).json({ success: false, message: 'Order ID and cancellation reason are required' });
//     }

//     const orders = await Order.find({ orderId, userId });
//     if (!orders || orders.length === 0) {
//       return res.status(404).json({ success: false, message: 'No orders found for this order ID' });
//     }

//     let allCancellable = true;
//     for (const order of orders) {
//       if (['delivered', 'cancelled', 'returned', 'return request'].includes(order.status)) {
//         allCancellable = false;
//         break;
//       }
//     }

//     if (!allCancellable) {
//       return res.status(400).json({ success: false, message: 'Some orders cannot be cancelled due to their current status' });
//     }

//     let totalRefund = 0;
//     for (const order of orders) {
//       const product = await Product.findById(order.product);
//       if (!product) {
//         return res.status(404).json({ success: false, message: `Product not found for order ${order._id}` });
//       }

//       product.quantity += order.quantity;
//       await product.save();

//       order.status = 'cancelled';
//       order.cancelReason = cancelReason;
//       order.cancelledOn = new Date();
//       await order.save();

//       if (order.paymentMethod !== 'COD') {
//         totalRefund += order.finalAmount;
//       }
//     }

//     if (totalRefund > 0) {
//       const wallet = await Wallet.findOneAndUpdate(
//         { userId },
//         {
//           $inc: { balance: totalRefund },
//           $push: {
//             transactions: {
//               type: 'Credit',
//               amount: totalRefund,
//               description: `Refund for order #${orderId} cancellation`,
//               status: 'Completed',
//             },
//           },
//         },
//         { upsert: true, new: true }
//       );

//       if (!wallet) {
//         console.error('Failed to update wallet for user:', userId);
//         return res.status(500).json({ success: false, message: 'Failed to process refund to wallet' });
//       }
//     }

//     return res.json({ success: true, message: 'All orders cancelled successfully', redirect: '/orders' });

//   } catch (error) {
//     console.error('Error cancelling all orders:', error.stack);
//     res.status(500).json({ success: false, message: 'Server error: Failed to cancel all orders' });
//   }
// };

// const returnOrder = async (req, res) => {
//   try {
//     const { orderId, returnReason } = req.body;
//     const userId = req.session.user;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
//     }

//     if (!orderId || !returnReason) {
//       return res.status(400).json({ success: false, message: 'Order ID and return reason are required' });
//     }

//     const order = await Order.findOne({ _id: orderId, userId });
//     if (!order) {
//       return res.status(404).json({ success: false, message: 'Order not found or you do not own this order' });
//     }

//     if (order.status !== 'delivered') {
//       return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
//     }

//     const deliveredOn = new Date(order.deliveredOn);
//     const now = new Date();
//     const daysSinceDelivery = (now - deliveredOn) / (1000 * 60 * 60 * 24);
//     if (daysSinceDelivery > 30) {
//       return res.status(400).json({ success: false, message: 'Return period has expired (30 days)' });
//     }

//     order.status = 'return request';
//     order.returnReason = returnReason;
//     order.returnedOn = new Date();
//     await order.save();

//     const product = await Product.findById(order.product);
//     if (product) {
//       await product.save();
//     }

//     res.json({ success: true, message: 'Return request submitted successfully', redirect: '/orders' });

//   } catch (error) {
//     console.error('Error submitting return request:', error.stack);
//     res.status(500).json({ success: false, message: 'Server error: Failed to submit return request' });
//   }
// };

// const newaddress = async (req, res) => {
//     try {
//         const userId = req.session.user;

//         if (!userId) {
//             return res.status(401).json({
//                 success: false,
//                 message: 'User not authenticated',
//             });
//         }

//         const { addressType, name, city, landMark, state, pincode, phone, altPhone, isPrimary } = req.body;

//         if (!name || !city || !landMark || !state || !pincode || !phone) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'All required fields must be filled',
//             });
//         }

//         const newAddressData = {
//             addressType,
//             name,
//             city,
//             landMark,
//             state,
//             pincode,
//             phone,
//             altPhone: altPhone || '',
//             isPrimary: !!isPrimary
//         };

//         let useraddress = await Address.findOne({ userId });

//         if (useraddress) {
//             if (isPrimary) {
//                 useraddress.address.forEach(addr => (addr.isPrimary = false));
//             }
//             useraddress.address.push(newAddressData);
//             await useraddress.save();
//         } else {
//             const newAddress = new Address({
//                 userId,
//                 address: [newAddressData]
//             });
//             await newAddress.save();
//         }

//         res.redirect('/checkout');
//     } catch (error) {
//         console.error('Error adding address:', error);
//         res.status(500).json({
//             success: false,
//             message: 'An error occurred while adding the address',
//         });
//     }
// };

// const editAddressCheckout = async (req, res) => {
//     try {
//         const userId = req.session.user;
//         if (!userId) {
//             return res.status(401).json({ success: false, message: 'Unauthorized' });
//         }

//         const addressId = req.params.id;
//         const addressData = {
//             addressType: req.body.addressType || '',
//             name: req.body.name,
//             city: req.body.city,
//             landMark: req.body.landMark,
//             state: req.body.state,
//             pincode: req.body.pincode,
//             phone: req.body.phone,
//             altPhone: req.body.altPhone || '',
//             isPrimary: req.body.isPrimary === 'true' || req.body.isPrimary === true
//         };

//         if (!addressData.name || !addressData.city || !addressData.landMark || !addressData.state || !addressData.pincode || !addressData.phone) {
//             return res.status(400).json({ success: false, message: 'All required fields must be filled' });
//         }

//         const addressDoc = await Address.findOne({ userId });
//         if (!addressDoc) {
//             return res.status(404).json({ success: false, message: 'Address document not found' });
//         }

//         const address = addressDoc.address.id(addressId);
//         if (!address) {
//             return res.status(404).json({ success: false, message: 'Address not found' });
//         }

//         if (addressData.isPrimary) {
//             addressDoc.address.forEach(addr => (addr.isPrimary = false));
//         }

//         address.set(addressData);
//         await addressDoc.save();

//         res.redirect('/checkout');
//     } catch (error) {
//         console.error('Error updating address:', error);
//         res.status(500).json({ success: false, message: 'Error updating address' });
//     }
// };

// const loadAboutPage = (req, res) => {
//   res.render('orders');
// };

// const generateInvoice = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const orderId = req.query.orderId;

//     const order = await Order.findById(orderId);
//     if (!order) {
//       return res.status(404).send("Order not found");
//     }
//     if (order.status !== "delivered") {
//       return res.status(400).send("Invoice is only available for delivered orders");
//     }
//     if (!order.invoiceDate) {
//       order.invoiceDate = new Date();
//       await order.save();
//     }

//     const templatePath = path.join(__dirname, "../../views/user/invoice-template.ejs");
//     const html = await ejs.renderFile(templatePath, { order });

//     const browser = await puppeteer.launch({ headless: true });
//     const page = await browser.newPage();

//     await page.setContent(html, { waitUntil: "networkidle0" });

//     const invoiceDir = path.join(__dirname, "../../public/invoices");
//     if (!fs.existsSync(invoiceDir)) {
//       fs.mkdirSync(invoiceDir, { recursive: true });
//     }

//     const fileName = `invoice-${order.orderId}.pdf`;
//     const filePath = path.join(invoiceDir, fileName);

//     await page.pdf({
//       path: filePath,
//       format: "A4",
//       printBackground: true,
//       margin: {
//         top: "20px",
//         right: "20px",
//         bottom: "20px",
//         left: "20px",
//       },
//     });

//     await browser.close();

//     res.download(filePath, fileName, (err) => {
//       if (err) {
//         console.error("Error sending file:", err);
//         res.status(500).send("Error generating invoice");
//       }
//     });
//   } catch (error) {
//     console.error("Error generating invoice:", error);
//     res.status(500).send("Error generating invoice");
//   }
// };

// const getCartTotal = async (req, res) => {
//     const userId = req.session.user;

//     try {
//         if (!userId) {
//             return res.status(401).json({ success: false, message: 'Please login to view cart.' });
//         }

//         const cart = await Cart.findOne({ userId }).populate('cart.productId');
//         if (!cart || cart.cart.length === 0) {
//             return res.status(400).json({ success: false, message: 'Your cart is empty.' });
//         }

//         let totalPrice = 0;
//         for (const item of cart.cart) {
//             if (item.productId) {
//                 totalPrice += item.productId.salePrice * item.quantity;
//             }
//         }

//         console.log('getCartTotal: Calculated total', { userId, totalPrice });

//         return res.status(200).json({
//             success: true,
//             totalPrice,
//         });
//     } catch (error) {
//         console.error('getCartTotal: Error calculating total:', error);
//         return res.status(500).json({ success: false, message: 'Failed to calculate cart total.' });
//     }
// };


// const getWalletBalance = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Please log in.' });
//     }
//     const wallet = await Wallet.findOne({ userId });
//     if (!wallet) {
//       return res.status(200).json({ success: true, balance: 0 });
//     }
//     return res.status(200).json({ success: true, balance: wallet.balance });
//   } catch (error) {
//     console.error('Error fetching wallet balance:', error);
//     return res.status(500).json({ success: false, message: 'Failed to fetch wallet balance.' });
//   }
// };

// const retryOrderCheckout = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const orderId = req.params.orderId.trim();

//     if (!userId) {
//       return res.render('checkout', {
//         cart: null,
//         addresses: [],
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons: [],
//         appliedCoupon: null,
//         error: 'Please log in to access checkout.',
//         outOfStockProducts: [],
//       });
//     }

//     const orders = await Order.find({ orderId, userId, status: 'failed' }).populate('product');
//     if (!orders || orders.length === 0) {
//       const existingOrders = await Order.find({ orderId, userId });
//       if (existingOrders.some(order => order.status !== 'failed')) {
//         return res.render('order-confirmation', {
//           orderId,
//           orders: existingOrders,
//           address: existingOrders[0]?.address || null,
//           paymentMethod: existingOrders[0]?.paymentMethod || null,
//           totalAmount: existingOrders.reduce((sum, item) => sum + (item.finalAmount || 0), 0),
//           totalPrice: existingOrders.reduce((sum, item) => sum + (item.totalPrice || 0), 0),
//           discount: existingOrders.reduce((sum, item) => sum + (item.discount || 0), 0),
//           couponDiscount: existingOrders.reduce((sum, item) => sum + (item.discount || 0) * (item.couponApplied ? 1 : 0), 0),
//           gst: existingOrders.reduce((sum, item) => sum + (item.totalPrice || 0), 0) > 2000 ? 10 : 0,
//           shippingCharge: 20,
//           error: 'Order has already been placed successfully.',
//         });
//       }
//       return res.render('checkout', {
//         cart: null,
//         addresses: [],
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons: [],
//         appliedCoupon: null,
//         error: 'No failed orders found for this order ID.',
//         outOfStockProducts: [],
//       });
//     }

//     const addresses = await Address.find({ userId });
//     const currentDate = new Date();
//     const coupons = await Coupon.find({
//       isList: true,
//       startDate: { $lte: currentDate },
//       endDate: { $gte: currentDate },
//       $or: [
//         { userId: { $size: 0 } },
//         { userId: new mongoose.Types.ObjectId(userId) }
//       ],
//       usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
//     });

//     // Reconstruct cart from failed orders
//     const cartItems = orders.map(order => ({
//       productId: order.product,
//       quantity: order.quantity,
//     }));

//     // Check stock availability
//     const outOfStockProducts = [];
//     for (const order of orders) {
//       if (order.product.quantity < order.quantity) {
//         outOfStockProducts.push({ productId: order.product, quantity: order.quantity });
//       }
//     }

//     if (outOfStockProducts.length > 0) {
//       return res.render('checkout', {
//         cart: null,
//         addresses: addresses.map(addr => addr.address).flat(),
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons,
//         appliedCoupon: null,
//         error: `Some products are out of stock: ${outOfStockProducts.map(item => item.productId.productName).join(', ')}.`,
//         outOfStockProducts,
//       });
//     }

//     const totalPrice = orders.reduce((sum, order) => sum + (order.price * order.quantity), 0);
//     const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     let couponDiscount = 0;

//     // Reapply coupon from failed order if it was used and still valid
//     if (orders[0].couponApplied && orders[0].couponCode) {
//       const coupon = await Coupon.findOne({
//         name: orders[0].couponCode,
//         isList: true,
//         startDate: { $lte: currentDate },
//         endDate: { $gte: currentDate },
//         usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
//       });
//       if (coupon && totalPrice >= coupon.minimumPrice) {
//         couponDiscount = coupon.offerPrice;
//         req.session.appliedCoupon = {
//           name: coupon.name,
//           offerPrice: coupon.offerPrice,
//           minimumPrice: coupon.minimumPrice,
//         };
//       }
//     }

//     const finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

//     // Update the cart with the failed orders' products
//     await Cart.findOneAndUpdate(
//       { userId },
//       { $set: { cart: cartItems } },
//       { upsert: true }
//     );

//     // Store the original orderId in the session for use in placeorder
//     req.session.retryOrderId = orderId;

//     res.render('checkout', {
//       cart: cartItems,
//       addresses: addresses.map(addr => addr.address).flat(),
//       totalPrice,
//       discount,
//       couponDiscount,
//       gst,
//       shippingCharge,
//       finalPrice,
//       coupons,
//       appliedCoupon: req.session.appliedCoupon || null,
//       error: null,
//       outOfStockProducts: [],
//     });
//   } catch (error) {
//     console.error('Error loading retry order checkout:', error);
//     res.render('checkout', {
//       cart: null,
//       addresses: [],
//       totalPrice: 0,
//       discount: 0,
//       couponDiscount: 0,
//       gst: 0,
//       shippingCharge: 20,
//       finalPrice: 0,
//       coupons: [],
//       appliedCoupon: null,
//       error: 'Failed to load checkout for retry.',
//       outOfStockProducts: [],
//     });
//   }
// };


// module.exports = {
//   placeorder,
//   loadcheckout,
//   applyCoupon,
//   removeCoupon,
//   createRazorpay,
//   loadOrderFailed,
//   getOrderConfirmation,
//   getOrders,
//   getOrderDetails,
//   cancelOrder,
//   cancelAllOrders,
//   returnOrder,
//   newaddress,
//   editAddressCheckout,
//   loadAboutPage,
//   generateInvoice,
//   getCartTotal,
//   getWalletBalance,
//   retryOrderCheckout
// };






// const User = require('../../models/userSchema');
// const Product = require('../../models/productSchema');
// const Cart = require('../../models/cartSchema');
// const Category = require('../../models/categorySchema');
// const Address = require('../../models/addressSchema');
// const Order = require('../../models/orderSchema');
// const Coupon = require('../../models/couponSchema');
// const Wallet = require('../../models/walletSchema');
// const { v4: uuidv4 } = require('uuid');
// const puppeteer = require('puppeteer');
// const path = require('path');
// const ejs = require('ejs');
// const fs = require('fs');
// const mongoose = require('mongoose');
// const Razorpay = require('razorpay');

// // Initialize Razorpay
// const rzp = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID,
//     key_secret: process.env.RAZORPAY_KEY_SECRET
// });

// const loadcheckout = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     if (!userId) {
//       return res.render('checkout', {
//         cart: null,
//         addresses: [],
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons: [],
//         appliedCoupon: null,
//         error: 'Please log in to access checkout.',
//         outOfStockProducts: [],
//       });
//     }

//     const cart = await Cart.findOne({ userId }).populate('cart.productId');
//     const addresses = await Address.find({ userId });

//     const currentDate = new Date();
//     const coupons = await Coupon.find({
//       isList: true,
//       startDate: { $lte: currentDate },
//       endDate: { $gte: currentDate },
//       $or: [
//         { userId: { $size: 0 } },
//         { userId: new mongoose.Types.ObjectId(userId) }
//       ],
//       usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
//     });

//     if (!cart || !cart.cart.length) {
//       return res.render('checkout', {
//         cart: null,
//         addresses: addresses.map(addr => addr.address).flat(),
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons,
//         appliedCoupon: req.session.appliedCoupon || null,
//         error: 'Your cart is empty.',
//         outOfStockProducts: [],
//       });
//     }

//     const outOfStockProducts = cart.cart.filter(item => item.productId.quantity <= 0);
//     let totalPrice = cart.cart.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
//     let discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     let gst = totalPrice > 2000 ? 10 : 0;
//     let shippingCharge = 20;
//     let couponDiscount = req.session.appliedCoupon ? req.session.appliedCoupon.offerPrice : 0;
//     let finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

//     if (outOfStockProducts.length > 0) {
//       await Cart.updateOne(
//         { userId },
//         { $pull: { cart: { productId: { $in: outOfStockProducts.map(item => item.productId._id) } } } }
//       );
//       const updatedCart = await Cart.findOne({ userId }).populate('cart.productId');
//       const validItems = updatedCart ? updatedCart.cart.filter(item => item.productId.quantity > 0) : [];
//       totalPrice = validItems.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
//       discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//       gst = totalPrice > 2000 ? 10 : 0;
//       couponDiscount = req.session.appliedCoupon ? req.session.appliedCoupon.offerPrice : 0;
//       shippingCharge = 20;
//       finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

//       return res.render('checkout', {
//         cart: validItems,
//         addresses: addresses.map(addr => addr.address).flat(),
//         totalPrice,
//         discount,
//         couponDiscount,
//         gst,
//         shippingCharge,
//         finalPrice,
//         coupons,
//         appliedCoupon: req.session.appliedCoupon || null,
//         error: 'Some products were out of stock and removed from your cart.',
//         outOfStockProducts,
//       });
//     }

//     res.render('checkout', {
//       cart: cart.cart.filter(item => item.productId.quantity > 0),
//       addresses: addresses.map(addr => addr.address).flat(),
//       totalPrice,
//       discount,
//       couponDiscount,
//       gst,
//       shippingCharge,
//       finalPrice,
//       coupons,
//       appliedCoupon: req.session.appliedCoupon || null,
//       error: null,
//       outOfStockProducts: [],
//     });
//   } catch (error) {
//     console.error('Error loading checkout page:', error);
//     res.render('checkout', {
//       cart: null,
//       addresses: [],
//       totalPrice: 0,
//       discount: 0,
//       couponDiscount: 0,
//       gst: 0,
//       shippingCharge: 20,
//       finalPrice: 0,
//       coupons: [],
//       appliedCoupon: null,
//       error: 'Failed to load checkout page.',
//       outOfStockProducts: [],
//     });
//   }
// };

// const applyCoupon = async (req, res) => {
//   try {
//     const { couponCode, cartTotal } = req.body;
//     const userId = req.session.user;
//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Please log in to apply a coupon.' });
//     }

//     const coupon = await Coupon.findOne({
//       name: couponCode.toUpperCase(),
//       isList: true,
//       startDate: { $lte: new Date() },
//       endDate: { $gte: new Date() },
//       $or: [
//         { userId: { $size: 0 } },
//         { userId: new mongoose.Types.ObjectId(userId) }
//       ],
//       usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
//     });

//     if (!coupon) {
//       return res.status(400).json({ success: false, message: 'Invalid, expired, or already used coupon.' });
//     }

//     if (cartTotal < coupon.minimumPrice) {
//       return res.status(400).json({ success: false, message: `Minimum purchase amount is ₹${coupon.minimumPrice}.` });
//     }

//     req.session.appliedCoupon = {
//       name: coupon.name,
//       offerPrice: coupon.offerPrice,
//       minimumPrice: coupon.minimumPrice
//     };

//     const discount = cartTotal > 1500 ? cartTotal * 0.1 : 0;
//     const gst = cartTotal > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     const finalPrice = cartTotal - discount - coupon.offerPrice + gst + shippingCharge;

//     res.json({
//       success: true,
//       discount,
//       couponDiscount: coupon.offerPrice,
//       finalPrice,
//       coupon: req.session.appliedCoupon,
//       message: 'Coupon applied successfully.'
//     });
//   } catch (error) {
//     console.error('Error applying coupon:', error);
//     res.status(500).json({ success: false, message: 'Failed to apply coupon.' });
//   }
// };

// const removeCoupon = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Please log in to remove coupon.' });
//     }

//     const cart = await Cart.findOne({ userId }).populate('cart.productId');
//     if (!cart || !cart.cart.length) {
//       req.session.appliedCoupon = null;
//       return res.json({
//         success: true,
//         discount: 0,
//         couponDiscount: 0,
//         finalPrice: 0,
//         message: 'Cart is empty.',
//       });
//     }

//     const totalPrice = cart.cart.reduce((sum, item) => sum + (item.productId.salePrice * item.quantity), 0);
//     const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     const finalPrice = totalPrice - discount + gst + shippingCharge;

//     req.session.appliedCoupon = null;

//     res.json({
//       success: true,
//       discount,
//       couponDiscount: 0,
//       finalPrice,
//       message: 'Coupon removed successfully.',
//     });
//   } catch (error) {
//     console.error('Error removing coupon:', error);
//     res.status(500).json({ success: false, message: 'Failed to remove coupon.' });
//   }
// };

// const createRazorpay = async (req, res) => {
//     const { amount, userId: clientUserId, couponCode, orderId } = req.body;
//     const sessionUserId = req.session.user;

//     try {
//         if (!sessionUserId) {
//             return res.status(401).json({ success: false, message: 'User not authenticated.' });
//         }

//         if (clientUserId !== sessionUserId) {
//             return res.status(403).json({ success: false, message: 'Unauthorized user ID.' });
//         }

//         if (!amount) {
//             return res.status(400).json({ success: false, message: 'Amount is required.' });
//         }

//         console.log('createRazorpay: Creating order', { sessionUserId, amount, couponCode, orderId });

//         const uuid = uuidv4().replace(/-/g, '');
//         const receipt = `rcpt_${uuid.substring(0, 36)}`;
//         console.log('createRazorpay: Generated receipt', { receipt, length: receipt.length });

//         const order = await rzp.orders.create({
//             amount: Math.round(amount * 100), // Convert to paise
//             currency: 'INR',
//             receipt: receipt,
//         });

//         console.log('createRazorpay: Razorpay order created', {
//             orderId: order.id,
//             razorpayOrderId: order.id,
//             receipt,
//         });

//         return res.status(200).json({
//             success: true,
//             razorpayOrderId: order.id, // Changed to match EJS expectation
//             amount: order.amount,
//             currency: order.currency,
//         });
//     } catch (error) {
//         console.error('createRazorpay: Error creating order:', {
//             message: error.message,
//             statusCode: error.statusCode,
//             errorDetails: error.error || error,
//         });
//         return res.status(500).json({
//             success: false,
//             message: error.error?.description || 'Failed to create Razorpay order.',
//         });
//     }
// };

// const placeorder = async (req, res) => {
//   const userId = req.session.user;
//   let {
//     selectedAddress,
//     paymentMethod,
//     couponCode,
//     razorpayPaymentId,
//     totalAmount,
//     orderId: razorpayOrderId,
//     razorpay_signature,
//   } = req.body || {};

//   // Normalize inputs
//   paymentMethod = Array.isArray(paymentMethod) ? paymentMethod[0] : paymentMethod;
//   totalAmount = Array.isArray(totalAmount) ? parseFloat(totalAmount[0]) : parseFloat(totalAmount);

//   // Define sharedOrderId early
//   let sharedOrderId = req.session.retryOrderId || razorpayOrderId || uuidv4();

//   try {
//     console.log('placeorder: Input data', {
//       userId,
//       paymentMethod,
//       totalAmount,
//       couponCode,
//       razorpayOrderId,
//       retryOrderId: req.session.retryOrderId,
//       sessionCoupon: req.session.appliedCoupon,
//     });

//     // Validate user
//     if (!userId) {
//       return res.status(401).json({
//         success: false,
//         message: 'Please login to place order',
//         redirect: '/login',
//       });
//     }

//     // Validate address
//     if (!selectedAddress) {
//       return res.status(400).json({
//         success: false,
//         message: 'Please select a shipping address.',
//         redirect: `/order-failed/${sharedOrderId}`,
//       });
//     }

//     const addressDoc = await Address.findOne({ userId, 'address._id': selectedAddress });
//     if (!addressDoc) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid address selected.',
//         redirect: `/order-failed/${sharedOrderId}`,
//       });
//     }
//     const selectedAddressData = addressDoc.address.find((addr) => addr._id.toString() === selectedAddress);

//     const address = {
//       name: selectedAddressData.name,
//       phone: selectedAddressData.phone,
//       pincode: selectedAddressData.pincode,
//       locality: selectedAddressData.locality || '',
//       address: selectedAddressData.address || selectedAddressData.landMark || '',
//       city: selectedAddressData.city,
//       state: selectedAddressData.state,
//       landmark: selectedAddressData.landMark || '',
//       alternatePhone: selectedAddressData.altPhone || '',
//       addressType: selectedAddressData.addressType || '',
//     };

//     // Fetch cart
//     const cart = await Cart.findOne({ userId }).populate('cart.productId');
//     if (!cart || cart.cart.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'Your cart is empty.',
//         redirect: `/order-failed/${sharedOrderId}`,
//       });
//     }

//     // Validate COD limit
//     if (paymentMethod === 'COD' && totalAmount > 1000) {
//       return res.status(400).json({
//         success: false,
//         message: 'COD not available for orders above ₹1000.',
//         redirect: `/order-failed/${sharedOrderId}`,
//       });
//     }

//     // Calculate totals
//     const totalPrice = cart.cart.reduce((sum, item) => sum + item.productId.salePrice * item.quantity, 0);
//     const baseDiscount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;

//     // Handle coupon
//     let couponDiscount = 0;
//     let effectiveCouponCode = null;
//     let couponApplied = false;

//     // Determine coupon to use
//     if (couponCode) {
//       effectiveCouponCode = couponCode;
//     } else if (req.session.appliedCoupon?.name) {
//       effectiveCouponCode = req.session.appliedCoupon.name;
//     } else if (req.session.retryOrderId) {
//       const existingFailedOrder = await Order.findOne({ orderId: req.session.retryOrderId, userId, status: 'failed' });
//       if (existingFailedOrder?.couponCode) {
//         effectiveCouponCode = existingFailedOrder.couponCode;
//       }
//     }

//     // Validate coupon
//     if (effectiveCouponCode) {
//       const coupon = await Coupon.findOne({
//         name: effectiveCouponCode,
//         usedBy: { $nin: [userId] },
//         isList: true,
//         startDate: { $lte: new Date() },
//         endDate: { $gte: new Date() },
//       });
//       if (coupon && totalPrice >= coupon.minimumPrice) {
//         couponDiscount = coupon.offerPrice;
//         couponApplied = true;
//         req.session.appliedCoupon = {
//           name: coupon.name,
//           offerPrice: coupon.offerPrice,
//           minimumPrice: coupon.minimumPrice,
//         };
//         console.log('placeorder: Coupon validated', { couponCode: effectiveCouponCode, couponDiscount });
//       } else {
//         console.log('placeorder: Invalid or ineligible coupon', { effectiveCouponCode });
//         effectiveCouponCode = null;
//         couponApplied = false;
//         req.session.appliedCoupon = null;
//       }
//     } else {
//       req.session.appliedCoupon = null;
//     }

//     // Check for existing orders
//     const existingOrders = await Order.find({ orderId: sharedOrderId, userId });
//     const hasNonFailedOrders = existingOrders.some((order) => order.status !== 'failed');

//     if (hasNonFailedOrders) {
//       req.session.retryOrderId = null;
//       return res.status(400).json({
//         success: false,
//         message: 'Order has already been placed successfully and cannot be retried.',
//         redirect: `/order-confirmation/${sharedOrderId}`,
//       });
//     }

//     const existingFailedOrders = existingOrders.filter((order) => order.status === 'failed');

//     // Validate stock
//     for (const item of cart.cart) {
//       if (!item.productId) continue;
//       if (item.productId.quantity < item.quantity) {
//         req.session.retryOrderId = null;
//         return res.status(400).json({
//           success: false,
//           message: `Product ${item.productId.productName} is out of stock.`,
//           redirect: `/order-failed/${sharedOrderId}`,
//         });
//       }
//     }

//     // Validate cart consistency for retries
//     if (existingFailedOrders.length > 0) {
//       for (const order of existingFailedOrders) {
//         const cartItem = cart.cart.find((item) => item.productId._id.toString() === order.product.toString());
//         if (!cartItem || cartItem.quantity !== order.quantity) {
//           req.session.retryOrderId = null;
//           return res.status(400).json({
//             success: false,
//             message: `Cart mismatch for product ${order.productName}. Please retry from the original order.`,
//             redirect: `/order-failed/${sharedOrderId}`,
//           });
//         }
//       }
//     }

//     // Handle Razorpay retry: Create new Razorpay order if missing
//     if (paymentMethod === 'RazorPay' && !razorpayOrderId && req.session.retryOrderId) {
//       console.log('placeorder: Generating new Razorpay order for retry', { sharedOrderId });
//       const receipt = `rcpt_${uuidv4()}`;
//       const razorpayOrder = await rzp.orders.create({
//         amount: Math.round(totalAmount * 100), // Convert to paise
//         currency: 'INR',
//         receipt,
//       });
//       razorpayOrderId = razorpayOrder.id;
//       sharedOrderId = razorpayOrderId; // Update sharedOrderId for consistency
//       console.log('placeorder: New Razorpay order created', { razorpayOrderId, receipt });
//     }

//     // Handle Wallet Payment
//     if (paymentMethod === 'Wallet') {
//       const wallet = await Wallet.findOne({ userId });
//       if (!wallet || wallet.balance < totalAmount) {
//         return res.status(400).json({
//           success: false,
//           message: 'Insufficient wallet balance or wallet not found.',
//           redirect: `/order-failed/${sharedOrderId}`,
//         });
//       }

//       const walletUpdate = await Wallet.findOneAndUpdate(
//         { userId, balance: { $gte: totalAmount } },
//         {
//           $inc: { balance: -totalAmount },
//           $push: {
//             transactions: {
//               type: 'Debit',
//               amount: totalAmount,
//               description: `Payment for order #${sharedOrderId}`,
//               status: 'Completed',
//             },
//           },
//         },
//         { new: true }
//       );

//       if (!walletUpdate) {
//         return res.status(400).json({
//           success: false,
//           message: 'Failed to deduct wallet balance.',
//           redirect: `/order-failed/${sharedOrderId}`,
//         });
//       }
//     }

//     // Handle Razorpay Payment Failure
//     if (paymentMethod === 'RazorPay' && !razorpayPaymentId && !razorpay_signature) {
//       console.log('placeorder: Razorpay payment failed or cancelled', { sharedOrderId });

//       if (existingFailedOrders.length > 0) {
//         for (const order of existingFailedOrders) {
//           order.status = 'failed';
//           order.paymentMethod = 'RazorPay';
//           order.invoiceDate = new Date();
//           order.couponApplied = couponApplied;
//           order.couponCode = effectiveCouponCode || undefined;
//           order.razorpayOrderId = razorpayOrderId;
//           await order.save();
//         }
//         console.log('placeorder: Updated existing failed orders', { sharedOrderId });
//       } else {
//         const failedOrders = cart.cart.map((item) => {
//           if (!item.productId) return null;
//           const itemTotalPrice = item.productId.salePrice * item.quantity;
//           const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
//           const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
//           const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
//           const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length);
//           return {
//             orderId: sharedOrderId,
//             userId,
//             product: item.productId._id,
//             productName: item.productId.productName,
//             productImages: item.productId.productImage || [],
//             quantity: item.quantity,
//             price: item.productId.salePrice,
//             totalPrice: itemTotalPrice,
//             discount: itemDiscount + itemCouponDiscount,
//             discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
//             finalAmount,
//             address,
//             invoiceDate: new Date(),
//             status: 'failed',
//             paymentMethod: 'RazorPay',
//             couponApplied,
//             couponCode: effectiveCouponCode || undefined,
//             razorpayOrderId,
//           };
//         }).filter(Boolean);
//         await Order.insertMany(failedOrders);
//         console.log('placeorder: Created new failed orders', { sharedOrderId });
//       }

//       req.session.retryOrderId = sharedOrderId;
//       return res.status(400).json({
//         success: false,
//         message: 'Payment failed or cancelled.',
//         redirect: `/order-failed/${sharedOrderId}`,
//         razorpayOrderId,
//       });
//     }

//     // Validate Razorpay Payment
//     if (paymentMethod === 'RazorPay' && razorpayPaymentId && razorpay_signature) {
//       const crypto = require('crypto');
//       const generatedSignature = crypto
//         .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
//         .update(`${razorpayOrderId}|${razorpayPaymentId}`)
//         .digest('hex');

//       if (generatedSignature !== razorpay_signature) {
//         req.session.retryOrderId = sharedOrderId;
//         return res.status(400).json({
//           success: false,
//           message: 'Invalid payment signature.',
//           redirect: `/order-failed/${sharedOrderId}`,
//           razorpayOrderId,
//         });
//       }
//     }

//     // Create orders
//     const orders = cart.cart.map((item) => {
//       if (!item.productId) return null;
//       const itemTotalPrice = item.productId.salePrice * item.quantity;
//       const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
//       const itemCouponDiscount = effectiveCouponCode ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
//       const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
//       return {
//         orderId: sharedOrderId,
//         userId,
//         product: item.productId._id,
//         productName: item.productId.productName,
//         productImages: item.productId.productImage || [],
//         quantity: item.quantity,
//         price: item.productId.salePrice,
//         totalPrice: itemTotalPrice,
//         discount: itemDiscount + itemCouponDiscount,
//         discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
//         finalAmount: itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + (shippingCharge / cart.cart.length),
//         address,
//         paymentMethod,
//         paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Completed',
//         razorpayOrderId: paymentMethod === 'RazorPay' ? razorpayOrderId : undefined,
//         razorpayPaymentId: paymentMethod === 'RazorPay' ? razorpayPaymentId : undefined,
//         status: paymentMethod === 'COD' ? 'pending' : 'confirmed',
//         couponCode: effectiveCouponCode || undefined,
//         couponApplied,
//         invoiceDate: new Date(),
//         stockRestored: false,
//       };
//     }).filter(Boolean);

//     // Delete existing failed orders
//     if (existingFailedOrders.length > 0) {
//       await Order.deleteMany({ orderId: sharedOrderId, userId, status: 'failed' });
//       console.log('placeorder: Deleted existing failed orders', { sharedOrderId });
//     }

//     // Save new orders
//     await Order.insertMany(orders);
//     console.log('placeorder: Orders created successfully', { sharedOrderId, status: orders.map((o) => o.status) });

//     // Update product quantities
//     for (const item of cart.cart) {
//       if (item.productId) {
//         await Product.findByIdAndUpdate(item.productId._id, {
//           $inc: { quantity: -item.quantity },
//         });
//       }
//     }

//     // Update coupon usage
//     if (effectiveCouponCode) {
//       await Coupon.findOneAndUpdate(
//         { name: effectiveCouponCode },
//         { $addToSet: { usedBy: userId } }
//       );
//     }

//     // Clear cart
//     await Cart.findOneAndUpdate({ userId }, { $set: { cart: [] } });

//     // Clear session
//     req.session.appliedCoupon = null;
//     req.session.retryOrderId = null;

//     return res.status(200).json({
//       success: true,
//       message: 'Order placed successfully.',
//       orderId: sharedOrderId,
//       redirect: `/order-confirmation/${sharedOrderId}`,
//     });
//   } catch (error) {
//     console.error('placeorder: Error', { error: error.message, stack: error.stack });
//     req.session.retryOrderId = sharedOrderId;
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to place order.',
//       redirect: `/order-failed/${sharedOrderId}`,
//       razorpayOrderId,
//     });
//   }
// };

// const loadOrderFailed = async (req, res) => {
//     const { orderId } = req.params;
//     const userId = req.session.user;
//     try {
//         if (!userId) {
//             return res.status(401).render('order-failed', {
//                 orders: [],
//                 totalPrice: 0,
//                 discount: 0,
//                 couponDiscount: 0,
//                 gst: 0,
//                 shippingCharge: 20,
//                 finalPrice: 0,
//                 message: 'Please log in to view this page.',
//                 userEmail: '',
//                 userPhone: '',
//                 razorpayKeyId: process.env.RAZORPAY_KEY_ID,
//                 userId: '',
//             });
//         }

//         const orders = await Order.find({
//             orderId,
//             userId: new mongoose.Types.ObjectId(userId),
//             status: 'failed',
//         }).populate('product');

//         if (!orders || orders.length === 0) {
//             return res.status(404).render('page-404', {
//                 message: 'No failed orders found for this order ID.',
//             });
//         }

//         const user = await User.findById(userId); // Fetch user for email and phone
//         const totalPrice = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
//         const baseDiscount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//         let couponDiscount = 0;
//         const gst = totalPrice > 2000 ? 10 : 0;
//         const shippingCharge = 20;

//         if (orders[0].couponApplied && orders[0].couponCode) {
//             const coupon = await Coupon.findOne({ name: orders[0].couponCode });
//             if (coupon && totalPrice >= coupon.minimumPrice) {
//                 couponDiscount = coupon.offerPrice;
//             }
//         }

//         const finalPrice = totalPrice - baseDiscount - couponDiscount + gst + shippingCharge;

//         res.render('order-failed', {
//             orders,
//             totalPrice,
//             discount: baseDiscount,
//             couponDiscount,
//             gst,
//             shippingCharge,
//             finalPrice,
//             message: 'Payment failed. Please try again or choose a different payment method.',
//             userEmail: user?.email || '',
//             userPhone: user?.phone || '',
//             razorpayKeyId: process.env.RAZORPAY_KEY_ID,
//             userId,
//         });
//     } catch (err) {
//         console.error('Error loading order failure page:', err);
//         res.status(500).render('user/500', {
//             message: 'Something went wrong while loading the failure page.',
//         });
//     }
// };

// const getOrderConfirmation = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const orderId = req.params.orderId.trim();

//     if (!userId) {
//       return res.render('order-confirmation', {
//         orderId: null,
//         orders: [],
//         address: null,
//         paymentMethod: null,
//         totalAmount: 0,
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         error: 'Please log in to view order confirmation.',
//       });
//     }

//     const orders = await Order.find({ userId, orderId }).lean();
//     if (!orders || orders.length === 0) {
//       console.error('getOrderConfirmation: Orders not found', { userId, orderId });
//       return res.render('order-confirmation', {
//         orderId,
//         orders: [],
//         address: null,
//         paymentMethod: null,
//         totalAmount: 0,
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         error: `Order not found for Order ID: ${orderId}. Please check your order details.`,
//       });
//     }

//     const totalPrice = orders.reduce((sum, order) => sum + order.totalPrice, 0);
//     const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     let couponDiscount = 0;

//     if (orders[0].couponApplied && orders[0].couponCode) {
//       const coupon = await Coupon.findOne({ name: orders[0].couponCode });
//       if (coupon) {
//         couponDiscount = coupon.offerPrice;
//         console.log('getOrderConfirmation: Coupon found', { couponCode: orders[0].couponCode, couponDiscount });
//       } else {
//         console.error('getOrderConfirmation: Coupon not found', { couponCode: orders[0].couponCode });
//       }
//     }

//     const totalAmount = totalPrice - discount - couponDiscount + gst + shippingCharge;
//     const address = orders[0].address;
//     const paymentMethod = orders[0].paymentMethod;

//     res.render('order-confirmation', {
//       orderId,
//       orders,
//       address,
//       paymentMethod,
//       totalAmount,
//       totalPrice,
//       discount,
//       couponDiscount,
//       gst,
//       shippingCharge,
//       error: null,
//     });
//   } catch (error) {
//     console.error('Error fetching order confirmation:', error);
//     res.render('order-confirmation', {
//       orderId: null,
//       orders: [],
//       address: null,
//       paymentMethod: null,
//       totalAmount: 0,
//       totalPrice: 0,
//       discount: 0,
//       couponDiscount: 0,
//       gst: 0,
//       shippingCharge: 20,
//       error: 'Failed to load order confirmation.',
//     });
//   }
// };

// const getOrders = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     if (!userId) {
//       return res.render('orders', {
//         groupedOrders: [],
//         error: 'Please log in to view your orders.',
//         currentPage: 1,
//         totalPages: 1,
//         limit: 5,
//         search: '',
//       });
//     }

//     const page = parseInt(req.query.page) || 1;
//     const limit = 5;
//     const skip = (page - 1) * limit;
//     const search = req.query.search || '';

//     let query = { userId };
//     if (search) {
//       query.$or = [
//         { orderId: { $regex: search, $options: 'i' } },
//         { productName: { $regex: search, $options: 'i' } },
//       ];
//     }

//     const orders = await Order.find(query).sort({ createdAt: -1 }).lean();

//     if (!orders || orders.length === 0) {
//       return res.render('orders', {
//         groupedOrders: [],
//         error: search ? 'No orders found matching your search.' : 'You have no orders yet.',
//         currentPage: page,
//         totalPages: 1,
//         limit,
//         search,
//       });
//     }

//     const groupedOrders = {};
//     orders.forEach(order => {
//       if (!groupedOrders[order.orderId]) {
//         groupedOrders[order.orderId] = [];
//       }
//       groupedOrders[order.orderId].push(order);
//     });

//     const groupedOrdersArray = Object.values(groupedOrders);
//     const totalOrders = groupedOrdersArray.length;
//     const totalPages = Math.ceil(totalOrders / limit);

//     const paginatedGroups = groupedOrdersArray.slice(skip, skip + limit);

//     if (!paginatedGroups.length) {
//       return res.render('orders', {
//         groupedOrders: [],
//         error: search ? 'No orders found matching your search.' : 'You have no orders yet.',
//         currentPage: page,
//         totalPages: 1,
//         limit,
//         search,
//       });
//     }

//     return res.render('orders', {
//       groupedOrders: paginatedGroups,
//       error: null,
//       currentPage: page,
//       totalPages,
//       limit,
//       search,
//     });
//   } catch (error) {
//     console.error('Error fetching orders:', error.stack);
//     res.render('orders', {
//       groupedOrders: [],
//       error: 'Failed to load your orders. Please try again.',
//       currentPage: 1,
//       totalPages: 1,
//       limit: 5,
//       search: '',
//     });
//   }
// };

// const getOrderDetails = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const orderId = req.params.orderId.trim();

//     if (!userId) {
//       return res.render('order-details', {
//         orders: [],
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         message: 'Please log in to view order details.',
//       });
//     }

//     const orders = await Order.find({ userId, orderId }).lean();

//     if (!orders || orders.length === 0) {
//       return res.render('order-details', {
//         orders: [],
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         message: 'Order not found.',
//       });
//     }

//     const totalPrice = orders.reduce((sum, order) => sum + order.totalPrice, 0);
//     const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     let couponDiscount = 0;

//     if (orders[0].couponApplied && orders[0].couponCode) {
//       const coupon = await Coupon.findOne({ name: orders[0].couponCode });
//       if (coupon) {
//         couponDiscount = coupon.offerPrice;
//       }
//     }

//     res.render('order-details', {
//       orders,
//       discount,
//       couponDiscount,
//       gst,
//       shippingCharge,
//       message: null
//     });
//   } catch (error) {
//     console.error('Error fetching order details:', error);
//     res.render('order-details', {
//       orders: [],
//       discount: 0,
//       couponDiscount: 0,
//       gst: 0,
//       shippingCharge: 20,
//       message: 'Failed to load order details. Please try again.',
//     });
//   }
// };

// const cancelOrder = async (req, res) => {
//   try {
//     const { orderId, cancelReason } = req.body;
//     const userId = req.session.user;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
//     }

//     if (!orderId || !cancelReason) {
//       return res.status(400).json({ success: false, message: 'Order ID and cancellation reason are required' });
//     }

//     const order = await Order.findOne({ _id: orderId, userId });
//     if (!order) {
//       return res.status(404).json({ success: false, message: 'Order not found or you do not own this order' });
//     }

//     if (
//       ['delivered', 'cancelled', 'returned', 'return request'].includes(order.status)
//     ) {
//       return res.status(400).json({ success: false, message: 'Order cannot be cancelled in its current status' });
//     }

//     const product = await Product.findById(order.product);
//     if (!product) {
//       return res.status(404).json({ success: false, message: 'Product not found' });
//     }

//     product.quantity += order.quantity;
//     await product.save();

//     order.status = 'cancelled';
//     order.cancelReason = cancelReason;
//     order.cancelledOn = new Date();
//     await order.save();

//     if (order.paymentMethod !== 'COD') {
//       const wallet = await Wallet.findOneAndUpdate(
//         { userId },
//         {
//           $inc: { balance: order.finalAmount },
//           $push: {
//             transactions: {
//               type: 'Credit',
//               amount: order.finalAmount,
//               description: `Refund for order #${order.orderId} cancellation`,
//               status: 'Completed',
//             },
//           },
//         },
//         { upsert: true, new: true }
//       );

//       if (!wallet) {
//         console.error('Failed to update wallet for user:', userId);
//         return res.status(500).json({ success: false, message: 'Failed to process refund to wallet' });
//       }
//     }

//     return res.json({ success: true, message: 'Order cancelled successfully', redirect: '/orders' });

//   } catch (error) {
//     console.error('Error cancelling order:', error.stack);
//     res.status(500).json({ success: false, message: 'Server error: Failed to cancel order' });
//   }
// };

// const cancelAllOrders = async (req, res) => {
//   try {
//     const { orderId, cancelReason } = req.body;
//     const userId = req.session.user;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
//     }

//     if (!orderId || !cancelReason) {
//       return res.status(400).json({ success: false, message: 'Order ID and cancellation reason are required' });
//     }

//     const orders = await Order.find({ orderId, userId });
//     if (!orders || orders.length === 0) {
//       return res.status(404).json({ success: false, message: 'No orders found for this order ID' });
//     }

//     let allCancellable = true;
//     for (const order of orders) {
//       if (['delivered', 'cancelled', 'returned', 'return request'].includes(order.status)) {
//         allCancellable = false;
//         break;
//       }
//     }

//     if (!allCancellable) {
//       return res.status(400).json({ success: false, message: 'Some orders cannot be cancelled due to their current status' });
//     }

//     let totalRefund = 0;
//     for (const order of orders) {
//       const product = await Product.findById(order.product);
//       if (!product) {
//         return res.status(404).json({ success: false, message: `Product not found for order ${order._id}` });
//       }

//       product.quantity += order.quantity;
//       await product.save();

//       order.status = 'cancelled';
//       order.cancelReason = cancelReason;
//       order.cancelledOn = new Date();
//       await order.save();

//       if (order.paymentMethod !== 'COD') {
//         totalRefund += order.finalAmount;
//       }
//     }

//     if (totalRefund > 0) {
//       const wallet = await Wallet.findOneAndUpdate(
//         { userId },
//         {
//           $inc: { balance: totalRefund },
//           $push: {
//             transactions: {
//               type: 'Credit',
//               amount: totalRefund,
//               description: `Refund for order #${orderId} cancellation`,
//               status: 'Completed',
//             },
//           },
//         },
//         { upsert: true, new: true }
//       );

//       if (!wallet) {
//         console.error('Failed to update wallet for user:', userId);
//         return res.status(500).json({ success: false, message: 'Failed to process refund to wallet' });
//       }
//     }

//     return res.json({ success: true, message: 'All orders cancelled successfully', redirect: '/orders' });

//   } catch (error) {
//     console.error('Error cancelling all orders:', error.stack);
//     res.status(500).json({ success: false, message: 'Server error: Failed to cancel all orders' });
//   }
// };

// const returnOrder = async (req, res) => {
//   try {
//     const { orderId, returnReason } = req.body;
//     const userId = req.session.user;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
//     }

//     if (!orderId || !returnReason) {
//       return res.status(400).json({ success: false, message: 'Order ID and return reason are required' });
//     }

//     const order = await Order.findOne({ _id: orderId, userId });
//     if (!order) {
//       return res.status(404).json({ success: false, message: 'Order not found or you do not own this order' });
//     }

//     if (order.status !== 'delivered') {
//       return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
//     }

//     const deliveredOn = new Date(order.deliveredOn);
//     const now = new Date();
//     const daysSinceDelivery = (now - deliveredOn) / (1000 * 60 * 60 * 24);
//     if (daysSinceDelivery > 30) {
//       return res.status(400).json({ success: false, message: 'Return period has expired (30 days)' });
//     }

//     order.status = 'return request';
//     order.returnReason = returnReason;
//     order.returnedOn = new Date();
//     await order.save();

//     const product = await Product.findById(order.product);
//     if (product) {
//       await product.save();
//     }

//     res.json({ success: true, message: 'Return request submitted successfully', redirect: '/orders' });

//   } catch (error) {
//     console.error('Error submitting return request:', error.stack);
//     res.status(500).json({ success: false, message: 'Server error: Failed to submit return request' });
//   }
// };

// const newaddress = async (req, res) => {
//     try {
//         const userId = req.session.user;

//         if (!userId) {
//             return res.status(401).json({
//                 success: false,
//                 message: 'User not authenticated',
//             });
//         }

//         const { addressType, name, city, landMark, state, pincode, phone, altPhone, isPrimary } = req.body;

//         if (!name || !city || !landMark || !state || !pincode || !phone) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'All required fields must be filled',
//             });
//         }

//         const newAddressData = {
//             addressType,
//             name,
//             city,
//             landMark,
//             state,
//             pincode,
//             phone,
//             altPhone: altPhone || '',
//             isPrimary: !!isPrimary
//         };

//         let useraddress = await Address.findOne({ userId });

//         if (useraddress) {
//             if (isPrimary) {
//                 useraddress.address.forEach(addr => (addr.isPrimary = false));
//             }
//             useraddress.address.push(newAddressData);
//             await useraddress.save();
//         } else {
//             const newAddress = new Address({
//                 userId,
//                 address: [newAddressData]
//             });
//             await newAddress.save();
//         }

//         res.redirect('/checkout');
//     } catch (error) {
//         console.error('Error adding address:', error);
//         res.status(500).json({
//             success: false,
//             message: 'An error occurred while adding the address',
//         });
//     }
// };

// const editAddressCheckout = async (req, res) => {
//     try {
//         const userId = req.session.user;
//         if (!userId) {
//             return res.status(401).json({ success: false, message: 'Unauthorized' });
//         }

//         const addressId = req.params.id;
//         const addressData = {
//             addressType: req.body.addressType || '',
//             name: req.body.name,
//             city: req.body.city,
//             landMark: req.body.landMark,
//             state: req.body.state,
//             pincode: req.body.pincode,
//             phone: req.body.phone,
//             altPhone: req.body.altPhone || '',
//             isPrimary: req.body.isPrimary === 'true' || req.body.isPrimary === true
//         };

//         if (!addressData.name || !addressData.city || !addressData.landMark || !addressData.state || !addressData.pincode || !addressData.phone) {
//             return res.status(400).json({ success: false, message: 'All required fields must be filled' });
//         }

//         const addressDoc = await Address.findOne({ userId });
//         if (!addressDoc) {
//             return res.status(404).json({ success: false, message: 'Address document not found' });
//         }

//         const address = addressDoc.address.id(addressId);
//         if (!address) {
//             return res.status(404).json({ success: false, message: 'Address not found' });
//         }

//         if (addressData.isPrimary) {
//             addressDoc.address.forEach(addr => (addr.isPrimary = false));
//         }

//         address.set(addressData);
//         await addressDoc.save();

//         res.redirect('/checkout');
//     } catch (error) {
//         console.error('Error updating address:', error);
//         res.status(500).json({ success: false, message: 'Error updating address' });
//     }
// };

// const loadAboutPage = (req, res) => {
//   res.render('orders');
// };

// const generateInvoice = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const orderId = req.query.orderId;

//     const order = await Order.findById(orderId);
//     if (!order) {
//       return res.status(404).send("Order not found");
//     }
//     if (order.status !== "delivered") {
//       return res.status(400).send("Invoice is only available for delivered orders");
//     }
//     if (!order.invoiceDate) {
//       order.invoiceDate = new Date();
//       await order.save();
//     }

//     const templatePath = path.join(__dirname, "../../views/user/invoice-template.ejs");
//     const html = await ejs.renderFile(templatePath, { order });

//     const browser = await puppeteer.launch({ headless: true });
//     const page = await browser.newPage();

//     await page.setContent(html, { waitUntil: "networkidle0" });

//     const invoiceDir = path.join(__dirname, "../../public/invoices");
//     if (!fs.existsSync(invoiceDir)) {
//       fs.mkdirSync(invoiceDir, { recursive: true });
//     }

//     const fileName = `invoice-${order.orderId}.pdf`;
//     const filePath = path.join(invoiceDir, fileName);

//     await page.pdf({
//       path: filePath,
//       format: "A4",
//       printBackground: true,
//       margin: {
//         top: "20px",
//         right: "20px",
//         bottom: "20px",
//         left: "20px",
//       },
//     });

//     await browser.close();

//     res.download(filePath, fileName, (err) => {
//       if (err) {
//         console.error("Error sending file:", err);
//         res.status(500).send("Error generating invoice");
//       }
//     });
//   } catch (error) {
//     console.error("Error generating invoice:", error);
//     res.status(500).send("Error generating invoice");
//   }
// };

// const getCartTotal = async (req, res) => {
//     const userId = req.session.user;

//     try {
//         if (!userId) {
//             return res.status(401).json({ success: false, message: 'Please login to view cart.' });
//         }

//         const cart = await Cart.findOne({ userId }).populate('cart.productId');
//         if (!cart || cart.cart.length === 0) {
//             return res.status(400).json({ success: false, message: 'Your cart is empty.' });
//         }

//         let totalPrice = 0;
//         for (const item of cart.cart) {
//             if (item.productId) {
//                 totalPrice += item.productId.salePrice * item.quantity;
//             }
//         }

//         console.log('getCartTotal: Calculated total', { userId, totalPrice });

//         return res.status(200).json({
//             success: true,
//             totalPrice,
//         });
//     } catch (error) {
//         console.error('getCartTotal: Error calculating total:', error);
//         return res.status(500).json({ success: false, message: 'Failed to calculate cart total.' });
//     }
// };

// const getWalletBalance = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Please log in.' });
//     }
//     const wallet = await Wallet.findOne({ userId });
//     if (!wallet) {
//       return res.status(200).json({ success: true, balance: 0 });
//     }
//     return res.status(200).json({ success: true, balance: wallet.balance });
//   } catch (error) {
//     console.error('Error fetching wallet balance:', error);
//     return res.status(500).json({ success: false, message: 'Failed to fetch wallet balance.' });
//   }
// };

// const retryOrderCheckout = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const orderId = req.params.orderId.trim();

//     if (!userId) {
//       return res.render('checkout', {
//         cart: null,
//         addresses: [],
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons: [],
//         appliedCoupon: null,
//         error: 'Please log in to access checkout.',
//         outOfStockProducts: [],
//       });
//     }

//     const orders = await Order.find({ orderId, userId, status: 'failed' }).populate('product');
//     if (!orders || orders.length === 0) {
//       const existingOrders = await Order.find({ orderId, userId });
//       if (existingOrders.some(order => order.status !== 'failed')) {
//         return res.render('order-confirmation', {
//           orderId,
//           orders: existingOrders,
//           address: existingOrders[0]?.address || null,
//           paymentMethod: existingOrders[0]?.paymentMethod || null,
//           totalAmount: existingOrders.reduce((sum, item) => sum + (item.finalAmount || 0), 0),
//           totalPrice: existingOrders.reduce((sum, item) => sum + (item.totalPrice || 0), 0),
//           discount: existingOrders.reduce((sum, item) => sum + (item.discount || 0), 0),
//           couponDiscount: existingOrders.reduce((sum, item) => sum + (item.discount || 0) * (item.couponApplied ? 1 : 0), 0),
//           gst: existingOrders.reduce((sum, item) => sum + (item.totalPrice || 0), 0) > 2000 ? 10 : 0,
//           shippingCharge: 20,
//           error: 'Order has already been placed successfully.',
//         });
//       }
//       return res.render('checkout', {
//         cart: null,
//         addresses: [],
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons: [],
//         appliedCoupon: null,
//         error: 'No failed orders found for this order ID.',
//         outOfStockProducts: [],
//       });
//     }

//     const addresses = await Address.find({ userId });
//     const currentDate = new Date();
//     const coupons = await Coupon.find({
//       isList: true,
//       startDate: { $lte: currentDate },
//       endDate: { $gte: currentDate },
//       $or: [
//         { userId: { $size: 0 } },
//         { userId: new mongoose.Types.ObjectId(userId) }
//       ],
//       usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
//     });

//     // Reconstruct cart from failed orders
//     const cartItems = orders.map(order => ({
//       productId: order.product,
//       quantity: order.quantity,
//     }));

//     // Check stock availability
//     const outOfStockProducts = [];
//     for (const order of orders) {
//       if (order.product.quantity < order.quantity) {
//         outOfStockProducts.push({ productId: order.product, quantity: order.quantity });
//       }
//     }

//     if (outOfStockProducts.length > 0) {
//       return res.render('checkout', {
//         cart: null,
//         addresses: addresses.map(addr => addr.address).flat(),
//         totalPrice: 0,
//         discount: 0,
//         couponDiscount: 0,
//         gst: 0,
//         shippingCharge: 20,
//         finalPrice: 0,
//         coupons,
//         appliedCoupon: null,
//         error: `Some products are out of stock: ${outOfStockProducts.map(item => item.productId.productName).join(', ')}.`,
//         outOfStockProducts,
//       });
//     }

//     const totalPrice = orders.reduce((sum, order) => sum + (order.price * order.quantity), 0);
//     const discount = totalPrice > 1500 ? totalPrice * 0.1 : 0;
//     const gst = totalPrice > 2000 ? 10 : 0;
//     const shippingCharge = 20;
//     let couponDiscount = 0;

//     // Reapply coupon from failed order if it was used and still valid
//     if (orders[0].couponApplied && orders[0].couponCode) {
//       const coupon = await Coupon.findOne({
//         name: orders[0].couponCode,
//         isList: true,
//         startDate: { $lte: currentDate },
//         endDate: { $gte: currentDate },
//         usedBy: { $ne: new mongoose.Types.ObjectId(userId) }
//       });
//       if (coupon && totalPrice >= coupon.minimumPrice) {
//         couponDiscount = coupon.offerPrice;
//         req.session.appliedCoupon = {
//           name: coupon.name,
//           offerPrice: coupon.offerPrice,
//           minimumPrice: coupon.minimumPrice,
//         };
//       }
//     }

//     const finalPrice = totalPrice - discount - couponDiscount + gst + shippingCharge;

//     // Update the cart with the failed orders' products
//     await Cart.findOneAndUpdate(
//       { userId },
//       { $set: { cart: cartItems } },
//       { upsert: true }
//     );

//     // Store the original orderId in the session for use in placeorder
//     req.session.retryOrderId = orderId;

//     res.render('checkout', {
//       cart: cartItems,
//       addresses: addresses.map(addr => addr.address).flat(),
//       totalPrice,
//       discount,
//       couponDiscount,
//       gst,
//       shippingCharge,
//       finalPrice,
//       coupons,
//       appliedCoupon: req.session.appliedCoupon || null,
//       error: null,
//       outOfStockProducts: [],
//     });
//   } catch (error) {
//     console.error('Error loading retry order checkout:', error);
//     res.render('checkout', {
//       cart: null,
//       addresses: [],
//       totalPrice: 0,
//       discount: 0,
//       couponDiscount: 0,
//       gst: 0,
//       shippingCharge: 20,
//       finalPrice: 0,
//       coupons: [],
//       appliedCoupon: null,
//       error: 'Failed to load checkout for retry.',
//       outOfStockProducts: [],
//     });
//   }
// };

// module.exports = {
//   placeorder,
//   loadcheckout,
//   applyCoupon,
//   removeCoupon,
//   createRazorpay,
//   loadOrderFailed,
//   getOrderConfirmation,
//   getOrders,
//   getOrderDetails,
//   cancelOrder,
//   cancelAllOrders,
//   returnOrder,
//   newaddress,
//   editAddressCheckout,
//   loadAboutPage,
//   generateInvoice,
//   getCartTotal,
//   getWalletBalance,
//   retryOrderCheckout
// };




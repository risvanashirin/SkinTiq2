

const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Category = require('../../models/categorySchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema');
const STATUS_CODES = require('../../helpers/statusCodes');

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

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    req.session.appliedCoupon = null;

    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).render("checkout", { error: "User not authenticated", cart: null, addresses: [], discount: 0, couponDiscount: 0, gst: 0, shippingCharge: 0, finalPrice: 0, totalPrice: 0, appliedCoupon: null, coupons: [], user: null, defaultAddress: null, defaultAddressId: '', adjustedQuantities: null });
    }

    let cart = await Cart.findOne({ userId }).populate({
      path: "cart.productId",
      populate: { path: "category" },
    });

    if (!cart || !cart.cart || cart.cart.length === 0) {
      return res.render("checkout", { error: null, cart: null, addresses: [], discount: 0, couponDiscount: 0, gst: 0, shippingCharge: 0, finalPrice: 0, totalPrice: 0, appliedCoupon: null, coupons: [], user: req.user, defaultAddress: null, defaultAddressId: '', adjustedQuantities: null });
    }

    const itemsToRemove = [];
    const blockedProductNames = [];
    const unlistedCategoryProductNames = [];
    const outOfStockProductNames = [];
    const adjustedQuantityProductNames = [];

    let newPrice = 0;
    for (let item of cart.cart) {
      const product = item.productId;

      if (!product) {
        itemsToRemove.push(item.productId);
        continue;
      }

      if (product.isBlocked) {
        itemsToRemove.push(product._id);
        blockedProductNames.push(product.productName);
        continue;
      }

      if (product.category && !product.category.isListed) {
        itemsToRemove.push(product._id);
        unlistedCategoryProductNames.push(product.productName);
        continue;
      }

      if (product.quantity === 0) {
        itemsToRemove.push(product._id);
        outOfStockProductNames.push(product.productName);
        continue;
      }

      if (item.quantity > product.quantity) {
        adjustedQuantityProductNames.push({
          name: product.productName,
          oldQuantity: item.quantity,
          newQuantity: product.quantity,
        });
        item.quantity = product.quantity;
      }

      newPrice += product.salePrice * item.quantity;
    }

    if (itemsToRemove.length > 0) {
      await Cart.updateOne(
        { userId },
        { $pull: { cart: { productId: { $in: itemsToRemove } } } }
      );

      cart = await Cart.findOne({ userId }).populate({
        path: "cart.productId",
        populate: { path: "category" },
      });

      newPrice = 0;
      if (cart && cart.cart) {
        for (const item of cart.cart) {
          if (item.productId && item.productId.salePrice) {
            newPrice += item.productId.salePrice * item.quantity;
          }
        }
      }
    }

    if (cart) {
      cart.price = newPrice;
      cart.totalPrice = newPrice;
      await cart.save();
    }

    let errorMessage = "";
    if (blockedProductNames.length > 0) {
      errorMessage += `${blockedProductNames.join(", ")} ${blockedProductNames.length > 1 ? "have" : "has"
        } been removed from your cart as ${blockedProductNames.length > 1 ? "they are" : "it is"
        } blocked.`;
    }
    if (unlistedCategoryProductNames.length > 0) {
      errorMessage += `${blockedProductNames.length > 0 ? " " : ""}${unlistedCategoryProductNames.join(
        ", "
      )} ${unlistedCategoryProductNames.length > 1 ? "have" : "has"
        } been removed from your cart because ${unlistedCategoryProductNames.length > 1 ? "their categories are" : "its category is"
        } unlisted.`;
    }
    if (outOfStockProductNames.length > 0) {
      errorMessage += `${blockedProductNames.length > 0 || unlistedCategoryProductNames.length > 0 ? " " : ""}${outOfStockProductNames.join(
        ", "
      )} ${outOfStockProductNames.length > 1 ? "have" : "has"
        } been removed from your cart because ${outOfStockProductNames.length > 1 ? "they are" : "it is"
        } out of stock.`;
    }
    if (adjustedQuantityProductNames.length > 0) {
      const quantityMessages = adjustedQuantityProductNames.map(
        (item) => `${item.name} quantity adjusted from ${item.oldQuantity} to ${item.newQuantity} due to limited stock.`
      );
      errorMessage += `${blockedProductNames.length > 0 || unlistedCategoryProductNames.length > 0 || outOfStockProductNames.length > 0 ? " " : ""}${quantityMessages.join(" ")}`;
    }

    const addresses = await Address.find({ userId });
    let defaultAddress = null;
    let defaultAddressId = '';
    if (addresses && addresses.length > 0) {
      defaultAddress = addresses.find(address => address.isPrimary) || addresses[0];
      defaultAddressId = defaultAddress ? defaultAddress._id.toString() : '';
    }

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
    }).sort({ endDate: 1 });

    const discount =  0;
    const appliedCoupon = req.session.appliedCoupon || null;
    const couponDiscount = appliedCoupon && newPrice >= appliedCoupon.minimumPrice ? appliedCoupon.offerPrice : 0;
    const gst = newPrice > 2000 ? 10 : 0;
    const shippingCharge = 20;
    const finalPrice = newPrice - discount - couponDiscount + gst + shippingCharge;

    res.render("checkout", {
      error: errorMessage || null,
      cart: cart ? cart.cart : [],
      addresses,
      discount,
      couponDiscount,
      gst,
      shippingCharge,
      finalPrice,
      totalPrice: newPrice,
      appliedCoupon: null,
      coupons,
      user: req.user,
      adjustedQuantities: adjustedQuantityProductNames.length > 0 ? adjustedQuantityProductNames : null,
      defaultAddress,
      defaultAddressId,
    });
  } catch (error) {
    console.error("Error loading checkout:", error);
    res.render("checkout", { error: "An error occurred while loading the checkout page", cart: null, addresses: [], discount: 0, couponDiscount: 0, gst: 0, shippingCharge: 0, finalPrice: 0, totalPrice: 0, appliedCoupon: null, coupons: [], user: null, adjustedQuantities: null, defaultAddress: null, defaultAddressId: '' });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode, cartTotal } = req.body;
    const userId = req.session.user;
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: 'Please log in to apply a coupon.' });
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
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Invalid, expired, or already used coupon.' });
    }

    if (cartTotal < coupon.minimumPrice) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Minimum purchase amount is ₹${coupon.minimumPrice}.` });
    }

    req.session.appliedCoupon = {
      name: coupon.name,
      offerPrice: coupon.offerPrice,
      minimumPrice: coupon.minimumPrice
    };

    const discount =  0;
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
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to apply coupon.' });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: 'Please log in to remove coupon.' });
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
    const discount = 0;
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
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to remove coupon.' });
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

    return res.status(STATUS_CODES.OK).json({
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
      errorDetails: error.error || error,
    });
    return res.status(500).json({
      success: false,
      message: error.error?.description || 'Failed to create Razorpay order.',
    });
  }
};

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

  let sharedOrderId = req.session.retryOrderId || razorpayOrderId || uuidv4();

  try {
    console.log('placeorder:', { userId, paymentMethod, totalAmount, couponCode, razorpayOrderId });

    // Validate user
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({
        success: false,
        message: 'Please login to place order',
        redirect: '/login',
      });
    }

    // Validate address
    if (!selectedAddress) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Please select a shipping address.',
        redirect: `/order-failed/${sharedOrderId}`,
      });
    }

    const addressDoc = await Address.findOne({ userId, 'address._id': selectedAddress });
    if (!addressDoc) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Invalid address selected.',
        redirect: `/order-failed/${sharedOrderId}`,
      });
    }
    const selectedAddressData = addressDoc.address.find((addr) => addr._id.toString() === selectedAddress);

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

    // Fetch user for customer name
    const user = await User.findById(userId);
    if (!user) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'User not found.',
        redirect: `/order-failed/${sharedOrderId}`,
      });
    }

    // Fetch cart
    const cart = await Cart.findOne({ userId }).populate('cart.productId');
    if (!cart || cart.cart.length === 0) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Your cart is empty.',
        redirect: `/order-failed/${sharedOrderId}`,
      });
    }

    // Validate stock
    for (const item of cart.cart) {
      if (!item.productId) continue;
      if (item.productId.quantity < item.quantity) {
        console.log('here have an issue with quantity')
        req.session.retryOrderId = null;
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          success: false,
          message: 'Product is out of stock.',
          redirect: `/order-failed/${sharedOrderId}`,
        });
      }
    }

    // Validate COD limit
    if (paymentMethod === 'COD' && totalAmount > 1000) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'COD not available for orders above ₹1000.',
        redirect: `/order-failed/${sharedOrderId}`,
      });
    }

    // Calculate totals
    const totalPrice = cart.cart.reduce((sum, item) => sum + item.productId.salePrice * item.quantity, 0);
    const baseDiscount =  0;
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
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Order has already been placed successfully and cannot be retried.',
        redirect: `/order-confirmation/${sharedOrderId}`,
      });
    }

    const existingFailedOrders = existingOrders.filter((order) => order.status === 'failed');

    // Handle Wallet Payment
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          success: false,
          message: 'Wallet not found. Please add funds or choose another payment method.',
          redirect: `/order-failed/${sharedOrderId}`,
        });
      }

      if (wallet.balance < totalAmount) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
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
            return res.status(STATUS_CODES.BAD_REQUEST).json({
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
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          success: false,
          message: 'Failed to deduct wallet balance. Insufficient funds or wallet error.',
          redirect: `/order-failed/${sharedOrderId}`,
        });
      }
    }

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
          const itemCouponDiscount = couponDiscount > 0 ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
          const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
          const itemShipping = shippingCharge / cart.cart.length;
          const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + itemShipping;
          const profitAmount = itemTotalPrice - itemDiscount - itemCouponDiscount - (item.productId.costPrice ? item.productId.costPrice * item.quantity : itemTotalPrice * 0.8);

          failedOrders.push({
            orderId: sharedOrderId,
            userId,
            product: item.productId._id,
            productName: item.productId.productName,
            productImages: item.productId.productImage || [],
            quantity: item.quantity,
            price: item.productId.salePrice,
            totalPrice: itemTotalPrice,
            finalAmountWithoutTax: itemTotalPrice - itemDiscount - itemCouponDiscount,
            discount: itemDiscount + itemCouponDiscount,
            discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
            finalAmount,
            address: selectedAddressData,
            invoiceDate: new Date(),
            status: 'failed',
            paymentMethod: 'RazorPay',
            couponApplied: !!effectiveCouponCode,
            couponCode: effectiveCouponCode,
            customerName: user.name,
            creditDebit: 'Debit',
            orderType: 'Order',
            charges: itemGst + itemShipping,
            profitAmount,
          });
        }
        const savedOrders = await Order.insertMany(failedOrders);
        console.log('placeorder: Failed orders saved', { sharedOrderId, savedOrders });
      }
      req.session.retryOrderId = null;
      return res.status(STATUS_CODES.BAD_REQUEST).json({
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
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          success: false,
          message: 'Invalid payment signature.',
          redirect: `/order-failed/${sharedOrderId}`,
        });
      }
    }

    // Create orders with proportional coupon discount
    const orders = cart.cart.map((item) => {
      const itemTotalPrice = item.productId.salePrice * item.quantity;
      const itemDiscount = baseDiscount > 0 ? (itemTotalPrice / totalPrice) * baseDiscount : 0;
      const itemCouponDiscount = couponDiscount > 0 ? (itemTotalPrice / totalPrice) * couponDiscount : 0;
      const itemGst = gst > 0 ? (itemTotalPrice / totalPrice) * gst : 0;
      const itemShipping = shippingCharge / cart.cart.length;
      const finalAmount = itemTotalPrice - itemDiscount - itemCouponDiscount + itemGst + itemShipping;
      const profitAmount = itemTotalPrice - itemDiscount - itemCouponDiscount - (item.productId.costPrice ? item.productId.costPrice * item.quantity : itemTotalPrice * 0.8);

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
        productImages: item.productId.images || item.productId.productImage || [],
        quantity: item.quantity,
        price: item.productId.salePrice,
        totalPrice: itemTotalPrice,
        discount: itemDiscount + itemCouponDiscount,
        discountedPrice: itemTotalPrice - itemDiscount - itemCouponDiscount,
        finalAmount,
        finalAmountWithoutTax: itemTotalPrice - itemDiscount - itemCouponDiscount,
        address,
        paymentMethod,
        paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Completed',
        razorpayOrderId: paymentMethod === 'RazorPay' ? razorpayOrderId : undefined,
        razorpayPaymentId: paymentMethod === 'RazorPay' ? razorpayPaymentId : undefined,
        status: paymentMethod === 'COD' ? 'pending' : 'confirmed',
        couponCode: effectiveCouponCode || undefined,
        couponApplied: couponApplied,
        invoiceDate: new Date(),
        stockRestored: false,
        customerName: user.name,
        creditDebit: 'Debit',
        orderType: 'Order',
        charges: itemGst + itemShipping,
        profitAmount,
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

    await Cart.findOneAndUpdate({ userId }, { $set: { cart: [] } });

    req.session.retryOrderId = null;

    return res.status(STATUS_CODES.OK).json({
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

const returnOrder = async (req, res) => {
  try {
    const { orderId, returnReason } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: 'Unauthorized: Please log in' });
    }

    if (!orderId || !returnReason) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Order ID and return reason are required' });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Order not found or you do not own this order' });
    }

    if (order.status !== 'delivered') {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Only delivered orders can be returned' });
    }

    const deliveredOn = new Date(order.deliveredOn);
    const now = new Date();
    const daysSinceDelivery = (now - deliveredOn) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > 30) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Return period has expired (30 days)' });
    }

    order.status = 'return request';
    order.returnReason = returnReason;
    order.returnedOn = new Date();
    order.orderType = 'Return';
    order.creditDebit = 'Credit';
    await order.save();

    const product = await Product.findById(order.product);
    if (product) {
      await product.save();
    }

    res.json({ success: true, message: 'Return request submitted successfully', redirect: '/orders' });

  } catch (error) {
    console.error('Error submitting return request:', error.stack);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error: Failed to submit return request' });
  }
};

const loadOrderFailed = async (req, res) => {
  const { orderId } = req.params;
  const userId = req.session.user;
  try {
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).render('order-failed', {
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
      return res.status(STATUS_CODES.NOT_FOUND).render('page-STATUS_CODES.NOT_FOUND', {
        message: 'No failed orders found for this order ID.',
      });
    }

    const totalPrice = orders.reduce((sum, order) => sum + order.totalPrice, 0);
    const discount =  0;
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
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).render('user/500', {
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
    const discount =  0;
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
    const discount =  0;
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
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: 'Unauthorized: Please log in' });
    }

    if (!orderId || !cancelReason) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Order ID and cancellation reason are required' });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Order not found or you do not own this order' });
    }

    if (
      ['delivered', 'cancelled', 'returned', 'return request'].includes(order.status)
    ) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Order cannot be cancelled in its current status' });
    }

    const product = await Product.findById(order.product);
    if (!product) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Product not found' });
    }

    product.quantity += order.quantity;
    await product.save();

    order.status = 'cancelled';
    order.cancelReason = cancelReason;
    order.cancelledOn = new Date();
    await order.save();

    if (order.paymentMethod !== 'COD') {
      const charge = order.finalAmount - order.finalAmountWithoutTax
      const wallet = await Wallet.findOneAndUpdate(
        { userId },
        {
          $inc: { balance: (order.finalAmount - charge) },
          $push: {
            transactions: {
              type: 'Credit',
              amount: (order.finalAmount - charge),
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
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error: Failed to cancel order' });
  }
};

const cancelAllOrders = async (req, res) => {
  try {
    const { orderId, cancelReason } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: 'Unauthorized: Please log in' });
    }

    if (!orderId || !cancelReason) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Order ID and cancellation reason are required' });
    }

    const orders = await Order.find({ orderId, userId });
    if (!orders || orders.length === 0) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'No orders found for this order ID' });
    }

    let allCancellable = true;
    for (const order of orders) {
      if (['delivered', 'cancelled', 'returned', 'return request'].includes(order.status)) {
        allCancellable = false;
        break;
      }
    }

    if (!allCancellable) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Some orders cannot be cancelled due to their current status' });
    }

    let totalRefund = 0;
    for (const order of orders) {
      const product = await Product.findById(order.product);
      if (!product) {
        return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: `Product not found for order ${order._id}` });
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
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error: Failed to cancel all orders' });
  }
};

const newaddress = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const { addressType, name, city, landMark, state, pincode, phone, altPhone, isPrimary } = req.body;

    if (!name || !city || !landMark || !state || !pincode || !phone) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
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
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'An error occurred while adding the address',
    });
  }
};

const editAddressCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
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
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'All required fields must be filled' });
    }

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Address document not found' });
    }

    const address = addressDoc.address.id(addressId);
    if (!address) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: 'Address not found' });
    }

    if (addressData.isPrimary) {
      addressDoc.address.forEach(addr => (addr.isPrimary = false));
    }

    address.set(addressData);
    await addressDoc.save();

    res.redirect('/checkout');
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error updating address' });
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
      return res.status(STATUS_CODES.NOT_FOUND).send("Order not found");
    }
    if (order.status !== "delivered") {
      return res.status(STATUS_CODES.BAD_REQUEST).send("Invoice is only available for delivered orders");
    }
    if (!order.invoiceDate) {
      order.invoiceDate = new Date();
      await order.save();
    }

    const templatePath = path.join(__dirname, "../../views/user/invoice-template.ejs");
    const html = await ejs.renderFile(templatePath, { order });
    console.log(html)

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

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
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Error generating invoice");
      }
    });
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).send("Error generating invoice");
  }
};

const getCartTotal = async (req, res) => {
  const userId = req.session.user;

  try {
    if (!userId) {
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: 'Please login to view cart.' });
    }

    const cart = await Cart.findOne({ userId }).populate('cart.productId');
    if (!cart || cart.cart.length === 0) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Your cart is empty.' });
    }

    let totalPrice = 0;
    for (const item of cart.cart) {
      if (item.productId) {
        totalPrice += item.productId.salePrice * item.quantity;
      }
    }

    console.log('getCartTotal: Calculated total', { userId, totalPrice });

    return res.status(STATUS_CODES.OK).json({
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
      return res.status(STATUS_CODES.UNAUTHORIZED).json({ success: false, message: 'Please log in.' });
    }
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(STATUS_CODES.OK).json({ success: true, balance: 0 });
    }
    return res.status(STATUS_CODES.OK).json({ success: true, balance: wallet.balance });
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
        user: req.session.user,
        retryOrderId: '',
        adjustedQuantities: null,
      });
    }

    // Find failed orders
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
        user: req.session.user,
        retryOrderId: '',
        adjustedQuantities: null,
      });
    }

    await Order.updateMany(
      { orderId, userId, status: 'failed' },
      { $set: { couponApplied: false, couponCode: null } }
    );

    const addresses = await Address.find({ userId });
    let defaultAddress = null;
    let defaultAddressId = '';
    if (addresses && addresses.length > 0) {
      const flatAddresses = addresses.reduce((acc, doc) => acc.concat(doc.address), []);
      defaultAddress = flatAddresses.find(address => address.isPrimary) || flatAddresses[0];
      defaultAddressId = defaultAddress ? defaultAddress._id.toString() : '';
    }

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
        addresses,
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
        user: req.session.user,
        retryOrderId: '',
        adjustedQuantities: null,
      });
    }

    const totalPrice = orders.reduce((sum, order) => sum + (order.price * order.quantity), 0);
    const discount =  0;
    const gst = totalPrice > 2000 ? 10 : 0;
    const shippingCharge = 20;
    const couponDiscount = 0;
    const finalPrice = totalPrice - discount + gst + shippingCharge;

    req.session.appliedCoupon = null;

    await Cart.findOneAndUpdate(
      { userId },
      { $set: { cart: cartItems } },
      { upsert: true }
    );

    const adjustedQuantityProductNames = [];

    req.session.retryOrderId = orderId;

    res.render('checkout', {
      cart: cartItems,
      addresses,
      totalPrice,
      discount,
      couponDiscount,
      gst,
      shippingCharge,
      finalPrice,
      coupons,
      appliedCoupon: null,
      error: null,
      outOfStockProducts: [],
      user: req.session.user,
      retryOrderId: orderId,
      adjustedQuantities: adjustedQuantityProductNames.length > 0 ? adjustedQuantityProductNames : null,
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
      user: req.session.user,
      retryOrderId: '',
      adjustedQuantities: null,
    });
  }
};

const checkQuantity = async (req, res) => {
  try {
    const userId = req.session.user;

    const cart = await Cart.findOne({ userId }).populate('cart.productId', 'productName quantity');

    if (!cart || cart.cart.length === 0) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: 'Cart is empty.' });
    }

    const mismatches = [];

    for (const item of cart.cart) {
      if (!item.productId) continue;

      if (item.quantity > item.productId.quantity) {
        mismatches.push({
          name: item.productId.productName,
          requested: item.quantity,
          available: item.productId.quantity
        });
      }
    }

    if (mismatches.length > 0) {
      return res.status(STATUS_CODES.OK).json({
        success: false,
        message: 'Some items are out of stock or changed.',
        items: mismatches
      });
    }

    return res.status(STATUS_CODES.OK).json({ success: true });
  } catch (err) {
    console.error('Error in checkQuantity:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  placeorder,
  loadCheckout,
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
  retryOrderCheckout,
  checkQuantity
};
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema(
  {
    orderId: {
      type: String,
      default: () => uuidv4(),
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: {
      type: String,
    },
    productImages: {
      type: [String],
      default: []
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountedPrice: {
      type: Number,
      min: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    finalAmountWithoutTax: {
      type: Number,
      required: true,
      min: 0,
    },
    address: {
      type: {
        name: { type: String },
        phone: { type: String },
        pincode: { type: String },
        locality: { type: String },
        address: { type: String },
        city: { type: String },
        state: { type: String },
        landmark: { type: String },
        alternatePhone: { type: String },
        addressType: { type: String }
      },
      required: true,
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'return request',
        'returned',
        'failed',
      ],
      required: true,
      default: 'pending',
    },
    cancelReason: {
      type: String,
    },
    returnReason: {
      type: String,
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    couponApplied: {
      type: Boolean,
      default: false,
    },
    couponApplied: {
      type: Boolean,
      default: false,
    },
    couponCode: {
      type: String,
      required: false,
    },
    deliveredOn: {
      type: Date,
    },
    stockRestored: {
      type: Boolean,
      default: false,
    },

    razorpayStatus: {
    type: String,
    enum: ['processing', 'success', 'failed'],
    default: 'processing', 
    
  },
  },
  { timestamps: true }
);

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;


const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    productName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    brand: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      required: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    regularPrice: {
      type: Number,
      required: true,
    },
    salePrice: {
      type: Number,
      default: 0, // Calculated based on offers
    },
    productOffer: {
      type: Number,
      default: 0,
    },
    quantity: {
      type: Number,
      default: 0,
    },
    color: {
      type: String,
      required: false,
    },
    skinConcern: {
      type: String,
      required: false,
    },
    skinType: {
      type: String,
      required: false,
    },
    productImage: {
      type: [String],
      required: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['available', 'out of stock', 'discontinued'],
      required: true,
      default: 'available',
    },
  },
  { timestamps: true }
);

// Pre-save middleware to calculate salePrice
ProductSchema.pre('save', async function (next) {
  const product = this;
  try {
    // Fetch category to get categoryOffer
    const category = await mongoose.model('Category').findById(product.category).lean();
    
    // Default to 0 if no offers
    const productOffer = product.productOffer || 0;
    const categoryOffer = category ? (category.categoryOffer || 0) : 0;

    // If both offers are 0 or less, set salePrice to regularPrice
    if (productOffer <= 0 && categoryOffer <= 0) {
      product.salePrice = product.regularPrice;
    } else {
      // Select the higher offer
      const discount = Math.max(productOffer, categoryOffer);
      // Calculate salePrice: regularPrice - (regularPrice * discount/100)
      product.salePrice = Number((product.regularPrice - (product.regularPrice * discount / 100)).toFixed(2));
    }

    // Ensure salePrice is not negative
    if (product.salePrice <= 0) {
      product.salePrice = product.regularPrice;
    }

    next();
  } catch (error) {
    console.error('Error calculating salePrice:', error);
    next(error);
  }
});

module.exports = mongoose.model('Product', ProductSchema);
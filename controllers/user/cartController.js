const User = require('../../models/userSchema'); 
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Category = require('../../models/categorySchema');
const STATUS_CODES = require('../../helpers/statusCodes');


const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, quantity } = req.body;
   if(!userId){
    return res.status(STATUS_CODES .UNAUTHORIZED).json({success:false,message: 'User not logged in'})
   }

    const product = await Product.findById(productId);
    if (!product) return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: "Product not found" });

    if (product.quantity < quantity) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({
        success: false,
        error: "out_of_stock",
        message: `Only ${product.quantity} item(s) available in stock`
      });
    }

    if (quantity > 5) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({
        success: false,
        error: "max_limit",
        message: "Maximum quantity limit is 5 per order"
      });
    }

    const productPrice = product.salePrice;
    const itemTotal = productPrice * quantity;

    let userCart = await Cart.findOne({ userId }).populate("cart.productId");

    if (!userCart) {
      userCart = new Cart({
        userId,
        cart: [{ productId, quantity }],
        price: itemTotal,
        totalPrice: itemTotal,
      });
    } else {
      const existingProductIndex = userCart.cart.findIndex(
        item => item.productId._id.toString() === productId
      );

      if (existingProductIndex > -1) {
        return res.status(STATUS_CODES .BAD_REQUEST).json({
          success: false,
          message: "This item is already in your cart. You can update the quantity in your cart."
        });
      }

      userCart.cart.push({ productId, quantity });

      // Recalculate total price
      let newPrice = 0;
      for (const item of userCart.cart) {
        const product = await Product.findById(item.productId);
        if (product) {
          newPrice += product.salePrice * item.quantity;
        }
      }
      userCart.price = newPrice;
      userCart.totalPrice = newPrice;
    }

    await userCart.save();

    res.status(STATUS_CODES .OK).json({ success: true, message: "Added to cart successfully", cart: userCart });

  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: "Internal server error" });
  }
};

const getCartData = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(STATUS_CODES .UNAUTHORIZED).json({ success: false, message: 'User not authenticated' });
    }

    let cart = await Cart.findOne({ userId }).populate({
      path: 'cart.productId',
      populate: { path: 'category brand' },
    });

    const adjustedQuantities = [];
    let errorMessage = '';

    if (!cart) {
      return res.json({
        success: true,
        cart: null,
        error: null,
        adjustedQuantities: null,
      });
    }

    const itemsToRemove = [];
    const blockedProductNames = [];
    const unlistedCategoryProductNames = [];
    const outOfStockProductNames = [];

    // Recalculate total price and check quantities
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

      // Check if cart quantity exceeds available stock
      if (item.quantity > product.quantity) {
        adjustedQuantities.push({
          name: product.productName,
          oldQuantity: item.quantity,
          newQuantity: product.quantity,
        });
        item.quantity = product.quantity; // Adjust to available stock
      }

      // Add to total price using current salePrice
      newPrice += product.salePrice * item.quantity;
    }

    // Remove invalid items
    if (itemsToRemove.length > 0) {
      await Cart.updateOne(
        { userId },
        { $pull: { cart: { productId: { $in: itemsToRemove } } } }
      );

      // Refetch cart after removing items
      cart = await Cart.findOne({ userId }).populate({
        path: 'cart.productId',
        populate: { path: 'category brand' },
      });

      // Recalculate price again if cart still exists
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

    // Construct error message
    if (blockedProductNames.length > 0) {
      errorMessage += `${blockedProductNames.join(', ')} ${
        blockedProductNames.length > 1 ? 'have' : 'has'
      } been removed from your cart as ${
        blockedProductNames.length > 1 ? 'they are' : 'it is'
      } blocked.`;
    }
    if (unlistedCategoryProductNames.length > 0) {
      errorMessage += `${blockedProductNames.length > 0 ? ' ' : ''}${unlistedCategoryProductNames.join(
        ', '
      )} ${
        unlistedCategoryProductNames.length > 1 ? 'have' : 'has'
      } been removed from your cart because ${
        unlistedCategoryProductNames.length > 1 ? 'their categories are' : 'its category is'
      } unlisted.`;
    }
    if (outOfStockProductNames.length > 0) {
      errorMessage += `${blockedProductNames.length > 0 || unlistedCategoryProductNames.length > 0 ? ' ' : ''}${outOfStockProductNames.join(
        ', '
      )} ${
        outOfStockProductNames.length > 1 ? 'have' : 'has'
      } been removed from your cart because ${
        outOfStockProductNames.length > 1 ? 'they are' : 'it is'
      } out of stock.`;
    }

    res.json({
      success: true,
      cart: cart ? {
        ...cart._doc,
        cart: cart.cart.map(item => ({
          ...item._doc,
          productId: item.productId ? {
            ...item.productId._doc,
            productImage: item.productId.productImage || [],
            salePrice: item.productId.salePrice || 0,
            productName: item.productId.productName || 'Product Not Found',
          } : null,
        })),
      } : null,
      error: errorMessage || null,
      adjustedQuantities: adjustedQuantities.length > 0 ? adjustedQuantities : null,
    });
  } catch (error) {
    console.error('Error fetching cart data:', error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: 'An error occurred while fetching the cart' });
  }
};

const shopaddToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;
    const quantity = 1;
    if (!userId){
      console.log("user not login")
      return res.status(STATUS_CODES .UNAUTHORIZED).json({ success: false, message: "User not logged in" });
    } 
  
    const product = await Product.findById(productId);
    if (!product) return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: "Product not found" });

    if (product.quantity < 1) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, error: "out_of_stock", message: "Product is out of stock" });
    }

    if (quantity > product.quantity) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({
        success: false,
        error: "out_of_stock",
        message: `Only ${product.quantity} item(s) available in stock`
      });
    }

    if (quantity > 5) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({
        success: false,
        error: "max_limit",
        message: "Maximum quantity limit is 5 per order"
      });
    }

    const productPrice = product.salePrice;
    const itemTotal = productPrice * quantity;

    let userCart = await Cart.findOne({ userId }).populate("cart.productId");

    if (!userCart) {
      userCart = new Cart({
        userId,
        cart: [{ productId, quantity }],
        price: itemTotal,
        totalPrice: itemTotal,
      });
    } else {
      const existingProductIndex = userCart.cart.findIndex(
        item => item.productId._id.toString() === productId
      );

      if (existingProductIndex > -1) {
        return res.status(STATUS_CODES .BAD_REQUEST).json({
          success: false,
          message: "This item is already in your cart. You can update the quantity in your cart."
        });
      }

      userCart.cart.push({ productId, quantity });

      // Recalculate total price
      let newPrice = 0;
      for (const item of userCart.cart) {
        const product = await Product.findById(item.productId);
        if (product) {
          newPrice += product.salePrice * item.quantity;
        }
      }
      userCart.price = newPrice;
      userCart.totalPrice = newPrice;
    }

    await userCart.save();

    res.status(STATUS_CODES .OK).json({ success: true, message: "Added to cart successfully", cart: userCart });

  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: "Internal server error" });
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, quantity } = req.body;

    if (quantity < 1) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: "Quantity must be at least 1" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: "Product not found" });
    }

    if (quantity > product.quantity) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({
        success: false,
        error: "out_of_stock",
        message: `Only ${product.quantity} item(s) available in stock`
      });
    }

    if (quantity > 5) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({
        success: false,
        error: "max_limit",
        message: "Maximum quantity limit is 5 per order"
      });
    }

    const cart = await Cart.findOne({ userId }).populate("cart.productId");
    if (!cart) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: "Cart not found" });
    }

    const item = cart.cart.find(item => item.productId._id.toString() === productId);
    if (!item) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: "Product not found in cart" });
    }

    item.quantity = quantity;

    // Recalculate total price
    let newPrice = 0;
    for (const cartItem of cart.cart) {
      if (cartItem.productId && cartItem.productId.salePrice) {
        newPrice += cartItem.productId.salePrice * cartItem.quantity;
      }
    }
    cart.price = newPrice;
    cart.totalPrice = newPrice;

    await cart.save();

    res.json({ success: true, cart });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to update cart" });
  }
};



const getCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(STATUS_CODES .UNAUTHORIZED).render("cart", { cart: null, error: "User not authenticated", adjustedQuantities: null });
    }

    let cart = await Cart.findOne({ userId }).populate({
      path: "cart.productId",
      populate: { path: "category" },
    });

    if (!cart) {
      // Render cart page with empty cart instead of error
      return res.render("cart", { cart: null, error: null, adjustedQuantities: null });
    }

    const itemsToRemove = [];
    const blockedProductNames = [];
    const unlistedCategoryProductNames = [];
    const outOfStockProductNames = [];
    const adjustedQuantityProductNames = [];

    // Recalculate total price and check quantities
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

      // Check if cart quantity exceeds available stock
      if (item.quantity > product.quantity) {
        adjustedQuantityProductNames.push({
          name: product.productName,
          oldQuantity: item.quantity,
          newQuantity: product.quantity,
        });
        item.quantity = product.quantity; // Adjust to available stock
      }

      // Add to total price using current salePrice
      newPrice += product.salePrice * item.quantity;
    }

    // Remove invalid items
    if (itemsToRemove.length > 0) {
      await Cart.updateOne(
        { userId },
        { $pull: { cart: { productId: { $in: itemsToRemove } } } }
      );

      // Refetch cart after removing items
      cart = await Cart.findOne({ userId }).populate({
        path: "cart.productId",
        populate: { path: "category" },
      });

      // Recalculate price again if cart still exists
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

    // Construct error message
    let errorMessage = "";
    if (blockedProductNames.length > 0) {
      errorMessage += `${blockedProductNames.join(", ")} ${
        blockedProductNames.length > 1 ? "have" : "has"
      } been removed from your cart as ${
        blockedProductNames.length > 1 ? "they are" : "it is"
      } blocked.`;
    }
    if (unlistedCategoryProductNames.length > 0) {
      errorMessage += `${blockedProductNames.length > 0 ? " " : ""}${unlistedCategoryProductNames.join(
        ", "
      )} ${
        unlistedCategoryProductNames.length > 1 ? "have" : "has"
      } been removed from your cart because ${
        unlistedCategoryProductNames.length > 1 ? "their categories are" : "its category is"
      } unlisted.`;
    }
    if (outOfStockProductNames.length > 0) {
      errorMessage += `${blockedProductNames.length > 0 || unlistedCategoryProductNames.length > 0 ? " " : ""}${outOfStockProductNames.join(
        ", "
      )} ${
        outOfStockProductNames.length > 1 ? "have" : "has"
      } been removed from your cart because ${
        outOfStockProductNames.length > 1 ? "they are" : "it is"
      } out of stock.`;
    }
    if (adjustedQuantityProductNames.length > 0) {
      const quantityMessages = adjustedQuantityProductNames.map(
        (item) => `${item.name} quantity adjusted from ${item.oldQuantity} to ${item.newQuantity} due to limited stock.`
      );
      errorMessage += `${blockedProductNames.length > 0 || unlistedCategoryProductNames.length > 0 || outOfStockProductNames.length > 0 ? " " : ""}${quantityMessages.join(" ")}`;
    }

    // Pass adjusted quantities to the front-end for SweetAlert
    res.render("cart", {
      cart,
      error: errorMessage || null,
      adjustedQuantities: adjustedQuantityProductNames.length > 0 ? adjustedQuantityProductNames : null,
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.render("cart", { cart: null, error: "An error occurred while fetching the cart", adjustedQuantities: null });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    const cart = await Cart.findOne({ userId }).populate({
      path: "cart.productId",
      populate: { path: "category" },
    });

    if (!cart) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: "Cart not found" });
    }

    const itemIndex = cart.cart.findIndex(item => item.productId._id.toString() === productId);
    if (itemIndex === -1) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: "Product not found in cart" });
    }

    const item = cart.cart[itemIndex];
    const product = item.productId;

    if (product.isBlocked) {
      return res.status(STATUS_CODES .FORBIDDEN).json({
        success: false,
        message: `${product.productName} cannot be removed because it is blocked and should not be in the cart.`,
      });
    }

    if (product.category && !product.category.isListed) {
      return res.status(STATUS_CODES .FORBIDDEN).json({
        success: false,
        message: `${product.productName} cannot be removed because its category is unlisted and should not be in the cart.`,
      });
    }

    cart.cart.splice(itemIndex, 1);

    // Recalculate total price
    let newPrice = 0;
    for (const item of cart.cart) {
      if (item.productId && item.productId.salePrice) {
        newPrice += item.productId.salePrice * item.quantity;
      }
    }
    cart.price = newPrice;
    cart.totalPrice = newPrice;

    await cart.save();

    res.status(STATUS_CODES .OK).json({
      success: true,
      message: "Deleted successfully",
      cart: {
        totalPrice: cart.totalPrice,
        cart: cart.cart,
      },
    });
  } catch (error) {
    console.error("Error removing product from cart:", error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to remove product" });
  }
};

const proceedToCheckout = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(STATUS_CODES .UNAUTHORIZED).json({ success: false, message: 'User not authenticated' });
    }

    const user = await User.findById(userId).populate('cart.productId');
    if (!user) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: 'User not found' });
    }

    const invalidItems = await Promise.all(user.cart.map(async (item) => {
      const product = await Product.findById(item.productId).populate('category');
      if (!product || !product.isListed || product.category.isBlocked || product.stock < item.quantity) {
        return { productId: item.productId, reason: product ? 'Out of stock or unavailable' : 'Product not found' };
      }
      return null;
    }));

    const invalidItemsFiltered = invalidItems.filter(item => item !== null);

    if (invalidItemsFiltered.length > 0) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({
        success: false,
        message: 'Some items in your cart are unavailable',
        invalidItems: invalidItemsFiltered,
      });
    }

    res.status(STATUS_CODES .OK).json({ success: true, message: 'Proceed to checkout' });
  } catch (error) {
    console.error('Error proceeding to checkout:', error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: 'An error occurred while proceeding to checkout' });
  }
};

module.exports = { 
    addToCart, 
    
    getCart, 
    removeFromCart, 
    updateCartQuantity, 
    proceedToCheckout,
    shopaddToCart
};
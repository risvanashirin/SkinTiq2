const Wishlist = require('../../models/wishlistSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const STATUS_CODES = require('../../helpers/statusCodes');


const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        let user = null;

        if (userId) {
            user = await User.findById(userId).select('name email');
        }

        if (!userId) {
            return res.status(STATUS_CODES .UNAUTHORIZED).render('wishlist', { wishlist: null, error: 'Invalid User', user });
        }

        let wishlist = await Wishlist.findOne({ UserId: userId })
            .populate({
                path: 'products.ProductId',
                populate: { path: 'category' }
            });

        if (!wishlist) {
            wishlist = new Wishlist({ UserId: userId, products: [] });
            await wishlist.save();
        }

        const itemsToRemove = [];
        const blockedProductNames = [];
        const unlistedCategoryProductNames = [];

        for (let item of wishlist.products) {
            const product = item.ProductId;

            if (!product) {
                itemsToRemove.push(item.ProductId);
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
        }

        let errorMessage = '';

        if (itemsToRemove.length > 0) {
            await Wishlist.updateOne(
                { UserId: userId },
                { $pull: { products: { ProductId: { $in: itemsToRemove } } } }
            );

            wishlist = await Wishlist.findOne({ UserId: userId })
                .populate({
                    path: 'products.ProductId',
                    populate: { path: 'category' }
                });

            if (blockedProductNames.length > 0) {
                errorMessage += `${blockedProductNames.join(', ')} ${blockedProductNames.length > 1 ? 'have' : 'has'} been removed from your wishlist as ${blockedProductNames.length > 1 ? 'they are' : 'it is'} blocked.`;
            }

            if (unlistedCategoryProductNames.length > 0) {
                errorMessage += `${blockedProductNames.length > 0 ? ' ' : ''}${unlistedCategoryProductNames.join(', ')} ${unlistedCategoryProductNames.length > 1 ? 'have' : 'has'} been removed from your wishlist because ${unlistedCategoryProductNames.length > 1 ? 'their categories are' : 'its category is'} unlisted.`;
            }

            return res.render('wishlist', { wishlist, error: errorMessage, user });
        }

        res.render('wishlist', { wishlist, error: null, user });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.render('wishlist', { wishlist: null, error: 'An error occurred while fetching the wishlist', user: null });
    }
};

const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.body.productId;

        if (!userId || !productId) {
            return res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: 'Missing user or product ID' });
        }

        const wishlist = await Wishlist.findOne({ UserId: userId })
            .populate({
                path: 'products.ProductId',
                populate: { path: 'category' }
            });

        if (!wishlist) {
            return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: 'Wishlist not found' });
        }

        const productIdStr = productId.toString();
        const itemIndex = wishlist.products.findIndex(item => item.ProductId._id.toString() === productIdStr);

        if (itemIndex === -1) {
            return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: 'Product not found in wishlist' });
        }

        const wishlistItem = wishlist.products[itemIndex];
        const actualProduct = wishlistItem.ProductId;

        if (actualProduct.isBlocked) {
            return res.status(STATUS_CODES .FORBIDDEN).json({
                success: false,
                message: `${actualProduct.productName} cannot be removed because it is blocked and should not be in the wishlist.`
            });
        }

        if (actualProduct.category && !actualProduct.category.isListed) {
            return res.status(STATUS_CODES .FORBIDDEN).json({
                success: false,
                message: `${actualProduct.productName} cannot be removed because its category is unlisted.`
            });
        }

        wishlist.products.splice(itemIndex, 1);
        await wishlist.save();

        res.status(STATUS_CODES .OK).json({
            status: true,
            message: "Deleted successfully",
            wishlist: {
                items: wishlist.products
            }
        });
    } catch (error) {
        console.error('Error removing product from wishlist:', error);
        res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to remove product' });
    }
};

const addToWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(STATUS_CODES .UNAUTHORIZED).json({ status: STATUS_CODES .UNAUTHORIZED, message: 'Please log in to add items to your wishlist.' });
        }

        const { productId } = req.body;
        if (!productId) {
            return res.status(STATUS_CODES .BAD_REQUEST).json({ status: false, message: 'Product ID is required.' });
        }

        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(STATUS_CODES .NOT_FOUND).json({ status: false, message: 'Product not found.' });
        }

        if (product.isBlocked) {
            return res.status(STATUS_CODES .FORBIDDEN).json({ status: false, message: `${product.productName} is blocked and cannot be added to the wishlist.` });
        }

        if (product.category && !product.category.isListed) {
            return res.status(STATUS_CODES .FORBIDDEN).json({ status: false, message: `${product.productName} belongs to an unlisted category and cannot be added to the wishlist.` });
        }

        let wishlist = await Wishlist.findOne({ UserId: userId });
        if (!wishlist) {
            wishlist = new Wishlist({ UserId: userId, products: [] });
        }

        const isProductInWishlist = wishlist.products.some(item => item.ProductId.toString() === productId);
        if (isProductInWishlist) {
            return res.status(STATUS_CODES .BAD_REQUEST).json({ status: false, message: `${product.productName} is already in your wishlist.` });
        }

        wishlist.products.push({ ProductId: productId });
        await wishlist.save();

        return res.status(STATUS_CODES .OK).json({ status: true, message: `${product.productName} added to wishlist successfully.` });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        return res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ status: false, message: 'An error occurred while adding the product to the wishlist.' });
    }
};

const addToCartfromwishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.body.productId;

        if (!userId || !productId) {
            return res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: "Missing user or product ID" });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: "Product not found" });
        }
        if (product.quantity === 0) {
            return res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: "Product is out of stock" });
        }

        let userCart = await Cart.findOne({ userId });

        if (!userCart) {
            userCart = new Cart({
                userId,
                cart: [],
                price: 0,
                totalPrice: 0
            });
        }

        const alreadyInCart = userCart.cart.some(item => item.productId.toString() === productId);

        if (!alreadyInCart) {
            userCart.cart.push({ productId, quantity: 1 });
        }

        await userCart.save();

        const userWishlist = await Wishlist.findOne({ UserId: userId });

        if (userWishlist) {
            const index = userWishlist.products.findIndex(
                item => item.ProductId.toString() === productId
            );

            if (index !== -1) {
                userWishlist.products.splice(index, 1);
                await userWishlist.save();
            }
        }

        return res.status(STATUS_CODES .OK).json({
            status: true,
            message: "Product successfully moved from wishlist to cart",
            cart: userCart.cart,
        });
    } catch (error) {
        console.error("Error in addToCartfromwishlist:", error);
        return res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Something went wrong. Please try again later.",
        });
    }
};

module.exports = {
    getWishlist,
    removeFromWishlist,
    addToWishlist,
    addToCartfromwishlist
};

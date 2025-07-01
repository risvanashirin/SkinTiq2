const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Brand = require('../../models/brandSchema');
const Cart = require('../../models/cartSchema');


const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const pageNotFound = async (req, res) => {
    try {
        res.render('page-404');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const loadHomepage = async (req, res) => {
    try {
        const user = req.session.user;
        const categories = await Category.find({ isListed: true });
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            quantity: { $gt: 0 }
        });

        if (user) {
            const userData = await User.findOne({ _id: user });
            if (userData.isBlocked) {
                req.session.destroy((err) => {
                    if (err) {
                        console.log('Session destruction error:', err.message);
                        return res.redirect('/pageNotFound');
                    }
                    return res.render('login', { message: "Your account has been blocked by the admin" });
                });
            } else {
                return res.render("home", { user: userData, products: productData });
            }
        } else {
            return res.render('home', { user: null, products: productData });
        }
    } catch (error) {
        console.log('Home page not loading', error);
        res.status(500).send('server error');
    }
};

const loadSignup = async (req, res) => {
    try {
        return res.render('signup');
    } catch (error) {
        console.log('Home page not loading:', error);
        res.status(500).send('Server Error');
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateReferralCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let referralCode = '';
    for (let i = 0; i < 6; i++) {
        referralCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return referralCode;
}

function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

async function sendVerificationEmail(email, otp) {
    try {
        console.log('Sending email to:', email, 'with OTP:', otp);
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });
        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`,
        });
        console.log('Email sent successfully:', info.accepted);
        return info.accepted.length > 0;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

const signup = async (req, res) => {
    try {
        console.log('Sign up operation started');
        const { name, phone, email, password, cPassword, referralCode } = req.body;
        console.log('Request body:', { name, phone, email, password, cPassword, referralCode });

        const otp = generateOtp();
        console.log('Generated OTP:', otp);

        const emailSent = await sendVerificationEmail(email, otp);
        console.log('Email sent status:', emailSent);
        if (!emailSent) {
            console.log('Email sending failed');
            return res.json('email-error');
        }

        req.session.userOtp = otp;
        req.session.userData = { name, phone, email, password, referralCode };
        console.log('Session data saved:', req.session.userData);
        console.log('OTP Sent:', otp);

        return res.render('verify-otp');
    } catch (error) {
        console.error('Signup error:', error);
        return res.redirect('/pageNotFound');
    }
};

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.error('Error hashing password:', error);
        throw error;
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        console.log('Received OTP:', otp);

        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
                referalCode: generateReferralCode()
            });
            await saveUserData.save();
            console.log('User saved with ID:', saveUserData._id);
            req.session.user = saveUserData._id;

            // Handle referral coupon logic
            if (user.referralCode) {
                console.log('Processing referral code:', user.referralCode);
                const referrer = await User.findOne({ referalCode: user.referralCode });
                if (referrer) {
                    console.log('Referrer found:', referrer._id);
                    const startDate = new Date();
                    const endDate = new Date();
                    endDate.setDate(endDate.getDate() + 30);

                    // Referrer coupon
                    const referrerCoupon = new Coupon({
                        name: `REF-${generateRandomString(6)}`,
                        startDate,
                        endDate,
                        offerPrice: 100,
                        minimumPrice: 150,
                        isList: true, // Active by default
                        userId: [referrer._id]
                    });
                    await referrerCoupon.save();
                    console.log('Referrer coupon created:', referrerCoupon.name);

                    // New user coupon
                    const newUserCoupon = new Coupon({
                        name: `NEW-${generateRandomString(6)}`,
                        startDate,
                        endDate,
                        offerPrice: 50,
                        minimumPrice: 150,
                        isList: true, // Active by default
                        userId: [saveUserData._id]
                    });
                    await newUserCoupon.save();
                    console.log('New user coupon created:', newUserCoupon.name);
                } else {
                    console.log('Invalid referral code:', user.referralCode);
                }
            }

            res.json({ success: true, redirect: "/" });
        } else {
            res.status(400).json({ success: false, message: "Invalid OTP, Please try again" });
        }
    } catch (error) {
        console.error('Error Verifying OTP:', error);
        res.status(500).json({ success: false, message: "An error occurred" });
    }
};

const resendOtp = async (req, res) => {
    try {
        if (!req.session.userData || !req.session.userData.email) {
            console.log('Session data missing in resendOtp');
            return res.status(400).json({ success: false, message: "Session data not found. Please start signup again." });
        }
        const { email } = req.session.userData;
        const otp = generateOtp();
        req.session.userOtp = otp;

        console.log('Resend OTP generated:', otp);
        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log('Resend OTP sent:', otp);
            return res.status(200).json({ success: true, message: "OTP Resend Successfully" });
        } else {
            console.log('Failed to resend OTP');
            return res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
        }
    } catch (error) {
        console.error('Error resending OTP:', error);
        res.status(500).json({ success: false, message: "Internal Server Error. Please try again" });
    }
};

const loadLogin = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.render('login');
        } else {
            return res.redirect('/');
        }
    } catch (error) {
        console.error('Error loading login:', error);
        return res.redirect('/pageNotFound');
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findUser = await User.findOne({ isAdmin: 0, email: email });

        if (!findUser) {
            return res.render("login", { message: "User not found" });
        }
        if (findUser.isBlocked) {
            return res.render('login', { message: "User is blocked by admin" });
        }
        const passwordMatch = await bcrypt.compare(password, findUser.password);

        if (!passwordMatch) {
            return res.render('login', { message: "Incorrect Password" });
        }
        req.session.user = findUser._id;
        res.redirect('/');
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { message: "Login failed. Please try again later" });
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.log('Session destruction error:', err.message);
                return res.redirect('/pageNotFound');
            }
            return res.redirect('/login');
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.redirect('/pageNotFound');
    }
};


const loadshop = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = userId ? await User.findById(userId) : null;

    if (userData && userData.isBlocked) {
      req.session.destroy((err) => {
        if (err) {
          console.log('Session destruction error:', err.message);
          return res.redirect('/pageNotFound');
        }
        return res.render('login', { message: "Your account has been blocked by the admin" });
      });
      return;
    }

    const { search, category, brand, sort, minPrice, maxPrice, page = 1 } = req.query;
    const perPage = 12;

    const getFilterParams = (query) => {
      const { search, category, brand, sort, minPrice, maxPrice } = query;
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      if (brand) params.append('brand', brand);
      if (sort) params.append('sort', sort);
      if (minPrice) params.append('minPrice', minPrice);
      if (maxPrice) params.append('maxPrice', maxPrice);
      return params.toString() ? `&${params.toString()}` : '';
    };

    const filter = {
      isBlocked: false,
      category: { $in: (await Category.find({ isListed: true })).map(c => c._id) },
      brand: { $in: (await Brand.find({ isListed: true })).map(b => b._id) }
    };

    if (search) filter.productName = { $regex: search, $options: "i" };
    if (category) {
      const categoryExists = await Category.findOne({ _id: category, isListed: true });
      if (categoryExists) {
        filter.category = category;
      } else {
        delete filter.category;
      }
    }
    if (brand) {
      const brandExists = await Brand.findOne({ _id: brand, isListed: true });
      if (brandExists) {
        filter.brand = brand;
      }
    }
    if (minPrice && maxPrice) {
      filter.salePrice = { $gte: Number(minPrice), $lte: Number(maxPrice) };
    }

    const sortOptions = {
      lowToHigh: { salePrice: 1 },
      highToLow: { salePrice: -1 },
      aToZ: { productName: 1 },
      zToA: { productName: -1 },
      newArrivals: { createdAt: -1 }
    };

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / perPage) || 1;
    const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));

    const products = await Product.find(filter)
      .populate('category')
      .populate('brand')
      .sort(sortOptions[sort] || { createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage);

    const productsWithOffers = products.map(product => {
      const categoryOffer = product.category?.categoryOffer || 0;
      const productOffer = product.productOffer || 0;
      const maxOffer = Math.max(categoryOffer, productOffer);
      const salePrice = product.regularPrice - (product.regularPrice * maxOffer / 100);
      return {
        ...product._doc,
        maxOffer,
        salePrice
      };
    });

    const priceRanges = {
      from: [500, 1000, 1500, 2000, 2500, 3000, 3500],
      to: [1000, 1500, 2000, 2500, 3000, 3500, 4000]
    };

    const listedCategories = await Category.find({ isListed: true });
    const listedBrands = await Brand.find({ isListed: true });

    // Fetch the user's cart
    const cart = userId ? await Cart.findOne({ userId }).populate('cart.productId') : null;

    if (process.env.NODE_ENV === 'development') {
      console.log("req.query:", req.query);
      console.log("products:", productsWithOffers);
      console.log("cart:", cart);
    }

    res.render("shop", {
      products: productsWithOffers,
      categories: listedCategories,
      brands: listedBrands,
      totalPages,
      currentPage,
      search,
      sort,
      category,
      brand,
      minPrice: req.query.minPrice || "",
      maxPrice: req.query.maxPrice || "",
      currentCategory: category || "",
      currentBrand: brand || "",
      priceRanges,
      user: userData,
      cart, // Pass the cart to the template
      filterParams: getFilterParams(req.query)
    });
  } catch (error) {
    console.error("Error loading shop page:", error);
    res.render("partials/user/error", { message: "Error loading shop page" });
  }
};


const productDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = userId ? await User.findById(userId) : null;

    if (userData && userData.isBlocked) {
      req.session.destroy((err) => {
        if (err) {
          console.log('Session destruction error:', err.message);
          return res.redirect('/pageNotFound');
        }
        return res.render('login', { message: "Your account has been blocked by the admin" });
      });
      return;
    }

    const productId = req.query.id;
    const product = await Product.findById(productId).populate('category').populate('brand'); // Added brand population
    if (!product) {
      return res.redirect('/404');
    }

    const findCategory = product.category;
    const categoryOffer = findCategory?.categoryOffer || 0;
    const productOffer = product.productOffer || 0;

    let offerSource = "No Offer";
    let maxOffer = 0;
    if (productOffer > 0 || categoryOffer > 0) {
      maxOffer = Math.max(categoryOffer, productOffer);
      offerSource = productOffer >= categoryOffer ? "Product Offer" : "Category Offer";
    }

    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: productId },
      isBlocked: false
    })
      .populate('category')
      .populate('brand') // Added brand population
      .limit(4);

    const relatedProductsWithOffers = relatedProducts.map(relatedProduct => {
      const relCategoryOffer = relatedProduct.category?.categoryOffer || 0;
      const relProductOffer = relatedProduct.productOffer || 0;
      const relMaxOffer = Math.max(relCategoryOffer, relProductOffer);
      const relOfferSource = relMaxOffer > 0 ? (relProductOffer >= relCategoryOffer ? "Product Offer" : "Category Offer") : "No Offer";
      return {
        ...relatedProduct._doc,
        maxOffer: relMaxOffer,
        offerSource: relOfferSource
      };
    });

    const categories = await Category.find({ isListed: true });
    const categoryIds = categories.map(category => category._id.toString());

    const products = await Product.find({
      isBlocked: false,
      category: { $in: categoryIds }
    })
      .populate('brand') // Added brand population
      .sort({ createdAt: -1 })
      .skip(0)
      .limit(9);

    res.render("product-detail", {
      user: userData,
      product: {
        ...product._doc,
        maxOffer,
        offerSource
      },
      products,
      quantity: product.quantity,
      category: findCategory,
      relatedProducts: relatedProductsWithOffers
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.redirect('/404');
  }
};

module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    loadshop,
    productDetails,
};
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const STATUS_CODES = require('../../helpers/statusCodes');

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const mongoose = require("mongoose");
const multer = require('multer');

const getProductAddPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true }).lean();
    const brand = await Brand.find({}).lean(); 
    res.render("product-add", {
      cat: category,
      brand: brand.length ? brand : [], 
      product: null,
    });
  } catch (error) {
    console.error("Error fetching add product page:", error.message);
    res.redirect("/pageError");
  }
};

const addProducts = async (req, res) => {
  try {
    const {
      productName,
      description,
      category,
      brand,
      regularPrice,
      quantity,
      skinType,
      skinConcern,
    } = req.body;

    if (!productName || !description || !category || !brand || !regularPrice || !quantity || !skinType || !skinConcern) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    if (!mongoose.isValidObjectId(category) || !mongoose.isValidObjectId(brand)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: "Invalid category or brand ID",
      });
    }

    const files = req.files;

    // Check for minimum 4 images
    if (!files || files.length < 4) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: "Please upload at least 4 images",
      });
    }

    // Check for duplicate product name
    const productExists = await Product.findOne({
      productName: { $regex: `^${productName}$`, $options: 'i' }
    });
    if (productExists) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: "Product already exists, try another name",
      });
    }

    // image upload directory exists
    const uploadDir = path.join(__dirname, "../../public/uploads/product-images");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Process images using sharp
    const imageFilenames = [];

    for (const file of files) {
      const inputFilePath = file.path;
      const filename = `${Date.now()}-${file.originalname.replace(/\s/g, "")}.webp`;
      const outputFilePath = path.join(uploadDir, filename);

      await sharp(inputFilePath)
        .resize(800, 800, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toFile(outputFilePath);

      imageFilenames.push(`/uploads/product-images/${filename}`);
      fs.unlinkSync(inputFilePath);
    }

    // Find category and brand by ID and validate
    const foundCategory = await Category.findById(category);
    const foundBrand = await Brand.findById(brand);
    if (!foundCategory || !foundBrand) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: "Category or brand not found",
      });
    }

    // Create and save product
    const newProduct = new Product({
      productName,
      description,
      category: foundCategory._id,
      brand: foundBrand._id,
      regularPrice: parseFloat(regularPrice),
      quantity: parseInt(quantity),
      skinType,
      skinConcern,
      productImage: imageFilenames,
      status: "available",
    });

    const savedProduct = await newProduct.save();

    return res.status(STATUS_CODES.OK).json({
      success: true,
      message: "Product added successfully",
      product: savedProduct,
    });
  } catch (error) {
    console.error("Error saving product:", error.message);
    return res.status(STATUS_CODES.  INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error while saving product",
    });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const lowStockThreshold = 5;

    let query = {};

    if (search) {
      const brandIds = await Brand.find({
        brandName: { $regex: search, $options: 'i' }
      }).select('_id').lean();

      query = {
        $or: [
          { productName: { $regex: search, $options: 'i' } },
          { brand: { $in: brandIds.map(b => b._id) } }
        ]
      };
    }

    const count = await Product.countDocuments(query);
    const totalPages = Math.ceil(count / limit);

    if (page > totalPages && totalPages !== 0) {
      return res.redirect(`/admin/products?page=${totalPages}${search ? `&search=${search}` : ''}`);
    }

    const productData = await Product.find(query)
      .sort({ createdAt: -1 }) 
      .limit(limit)
      .skip((page - 1) * limit)
      .populate('category')
      .populate('brand')
      .lean();

    const productsWithStockInfo = productData.map(product => {
      const productDiscount = product.productOffer || 0;
      const categoryDiscount = product.category ? (product.category.categoryOffer || 0) : 0;
      const maxDiscount = Math.max(productDiscount, categoryDiscount);
      const salePrice = product.regularPrice * (1 - maxDiscount / 100);

      return {
        ...product,
        isLowStock: product.quantity > 0 && product.quantity <= lowStockThreshold,
        status: product.quantity === 0 ? 'out of stock' : product.status,
        categoryOffer: product.category ? (product.category.categoryOffer || 0) : 0,
        salePrice: salePrice
      };
    });

    const category = await Category.find({ isListed: true }).lean();
    const brand = await Brand.find({ isBlocked: false }).lean();

    if (category && brand) {
      res.render("products", {
        searchQuery: search,
        data: productsWithStockInfo,
        currentPage: page,
        totalPages,
        cat: category,
        brand: brand,
      });
    } else {
      res.render("page-STATUS_CODES. NOT_FOUND");
    }
  } catch (error) {
    console.error("Error fetching products:", error.message);
    res.redirect("/pageError");
  }
};



const addProductOffer = async (req, res) => {
  try {
    const { productId, percentage } = req.body;

    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: "Invalid product ID" });
    }

    const offerPercentage = parseInt(percentage);
    if (isNaN(offerPercentage) || offerPercentage < 0 || offerPercentage > 99) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: "Offer percentage must be between 0 and 99" });
    }

    const findProduct = await Product.findById(productId);
    if (!findProduct) {
      return res.status(STATUS_CODES. NOT_FOUND).json({ status: false, message: "Product not found" });
    }

    findProduct.productOffer = offerPercentage;
    await findProduct.save();

    res.json({ status: true, message: "Offer added successfully" });
  } catch (error) {
    console.error("Error adding product offer:", error.message);
    res.status(STATUS_CODES.  INTERNAL_SERVER_ERROR).json({ status: false, message: "Internal server error" });
  }
};

const editProductOffer = async (req, res) => {
  try {
    const { productId, percentage } = req.body;

    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: "Invalid product ID" });
    }

    const offerPercentage = parseInt(percentage);
    if (isNaN(offerPercentage) || offerPercentage < 0 || offerPercentage > 99) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: "Offer percentage must be between 0 and 99" });
    }

    const findProduct = await Product.findById(productId);
    if (!findProduct) {
      return res.status(STATUS_CODES. NOT_FOUND).json({ status: false, message: "Product not found" });
    }

    findProduct.productOffer = offerPercentage;
    await findProduct.save();

    res.json({ status: true, message: "Offer updated successfully" });
  } catch (error) {
    console.error("Error editing product offer:", error.message);
    res.status(STATUS_CODES.  INTERNAL_SERVER_ERROR).json({ status: false, message: "Internal server error" });
  }
};

const removeProductOffer = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: "Invalid product ID" });
    }

    const findProduct = await Product.findById(productId);
    if (!findProduct) {
      return res.status(STATUS_CODES. NOT_FOUND).json({ status: false, message: "Product not found" });
    }

    findProduct.productOffer = 0;
    await findProduct.save();

    res.json({ status: true, message: "Offer removed successfully" });
  } catch (error) {
    console.error("Error removing product offer:", error.message);
    res.status(STATUS_CODES.  INTERNAL_SERVER_ERROR).json({ status: false, message: "Internal server error" });
  }
};

const blockProduct = async (req, res) => {
  try {
    let id = req.query.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: "Invalid product ID" });
    }
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.json({ status: true, message: "Product blocked successfully" });
  } catch (error) {
    console.error("Error blocking product:", error.message);
    res.status(STATUS_CODES.  INTERNAL_SERVER_ERROR).json({ status: false, message: "Internal server error" });
  }
};

const unblockProduct = async (req, res) => {
  try {
    const id = req.query.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ status: false, message: "Invalid product ID" });
    }
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.json({ status: true, message: "Product unblocked successfully" });
  } catch (error) {
    console.error("Error unblocking product:", error.message);
    res.status(STATUS_CODES.  INTERNAL_SERVER_ERROR).json({ status: false, message: "Internal server error" });
  }
};

const geteditProduct = async (req, res) => {
  try {
    const id = req.query.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.redirect("/pageError");
    }
    let product = await Product.findOne({ _id: id }).populate('category').lean();

    if (!product) {
      return res.redirect("/pageError");
    }

    // Handle brand field if it's a string (old schema)
    if (typeof product.brand === 'string' && product.brand.trim()) {
      const brandDoc = await Brand.findOne({ brandName: product.brand }).lean();
      if (brandDoc) {
        // Update product in database to use ObjectId
        await Product.updateOne(
          { _id: id },
          { $set: { brand: brandDoc._id } }
        );
        // Update local product object for rendering
        product.brand = { _id: brandDoc._id, brandName: brandDoc.brandName, isBlocked: brandDoc.isBlocked };
      } else {
        console.warn(`No brand found for product ${product.productName} with brand name ${product.brand}`);
        // Set brand to null or a default value to prevent rendering issues
        product.brand = null;
      }
    } else if (product.brand && mongoose.isValidObjectId(product.brand)) {
      // Populate brand if it's an ObjectId
      const brandDoc = await Brand.findById(product.brand).lean();
      product.brand = brandDoc || null;
    } else {
      product.brand = null; // Handle cases where brand is missing
    }

    const category = await Category.find({ isListed: true }).lean();
    const brand = await Brand.find({}).lean();
    // console.log(`Fetched ${brand.length} brands for edit product page:`, brand.map(b => ({ id: b._id, name: b.brandName, isBlocked: b.isBlocked })));

    res.render("edit-product", {
      product: product,
      cat: category,
      brand: brand.length ? brand : [],
    });
  } catch (error) {
    console.error("Error fetching edit product page:", error.message);
    res.redirect("/pageError");
  }
};




// const updateProduct = async (req, res) => {
//   try {
//     const productId = req.params.id;
//     if (!mongoose.isValidObjectId(productId)) {
//       return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid product ID" });
//     }

//     const {
//       productName,
//       description,
//       category,
//       brand,
//       regularPrice,
//       quantity,
//       skinType,
//       skinConcern,
//       deletedImages,
//     } = req.body;

//     if (!productName || !description || !category || !brand || !regularPrice || !quantity || !skinType || !skinConcern) {
//       return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "All required fields must be provided" });
//     }

//     if (!mongoose.isValidObjectId(category) || !mongoose.isValidObjectId(brand)) {
//       return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid category or brand ID" });
//     }

//     if (parseFloat(regularPrice) <= 0) {
//       return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Regular price must be greater than 0" });
//     }

//     if (parseInt(quantity) < 0) {
//       return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Quantity cannot be negative" });
//     }

//     let deletedImagesArray = [];
//     try {
//       deletedImagesArray = deletedImages ? JSON.parse(deletedImages) : [];
//     } catch (error) {
//       console.error("Error parsing deletedImages:", error.message);
//       return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid deletedImages format" });
//     }

//     const product = await Product.findById(productId);
//     if (!product) {
//       return res.status(STATUS_CODES. NOT_FOUND).json({ success: false, message: "Product not found" });
//     }

//     const foundCategory = await Category.findById(category);
//     const foundBrand = await Brand.findById(brand);
//     if (!foundCategory || !foundBrand) {
//       return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Category or brand not found" });
//     }

//     // Remove deleted images with retry mechanism
//     if (deletedImagesArray.length > 0) {
//       for (const imageUrl of deletedImagesArray) {
//         const imagePath = path.join(__dirname, "../../public", imageUrl);
//         let deleted = false;
//         let attempts = 0;

//         while (!deleted && attempts < 3) {
//           try {
//             if (fs.existsSync(imagePath)) {
//               await fs.promises.unlink(imagePath);
//             }
//             deleted = true;
//           } catch (err) {
//             if (err.code === 'EBUSY') {
//               console.warn(`Image ${imagePath} is busy, retrying...`);
//               await new Promise((resolve) => setTimeout(resolve, STATUS_CODES.  INTERNAL_SERVER_ERROR)); // wait before retry
//               attempts++;
//             } else {
//               console.error(`Failed to delete image ${imagePath}:`, err.message);
//               break;
//             }
//           }
//         }

//         product.productImage = product.productImage.filter((img) => img !== imageUrl);
//       }
//     }

//     // Process new images with Sharp
//     const uploadDir = path.join(__dirname, "../../public/uploads/product-images");
//     if (!fs.existsSync(uploadDir)) {
//       fs.mkdirSync(uploadDir, { recursive: true });
//     }

//     const newImages = [];
//     if (req.files && req.files.length > 0) {
//       for (const file of req.files) {
//         const isCropped = file.originalname.startsWith('cropped-image-');
//         const filename = `${Date.now()}-${file.originalname.replace(/\s/g, "")}.webp`;
//         const outputFilePath = path.join(uploadDir, filename);

//         await sharp(file.path)
//           .resize(800, 800, {
//             fit: "inside",
//             withoutEnlargement: true,
//           })
//           .webp({ quality: 80 })
//           .toFile(outputFilePath);

//         // Only add the image to newImages if it's a cropped image
//         if (isCropped) {
//           newImages.push(`/uploads/product-images/${filename}`);
//         }

//         // Always delete the temporary uploaded file
//         fs.unlinkSync(file.path);
//       }
//     }

//     // Update images: keep existing images (minus deleted ones) and add new cropped images
//     const updatedImages = [...product.productImage, ...newImages];

//     if (updatedImages.length < 4) {
//       return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "At least 4 images are required" });
//     }
//     if (updatedImages.length > 8) {
//       return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Cannot upload more than 8 images" });
//     }

//     // Update product fields
//     product.productName = productName;
//     product.description = description;
//     product.category = category;
//     product.brand = brand;
//     product.regularPrice = parseFloat(regularPrice);
//     product.quantity = parseInt(quantity);
//     product.skinType = skinType;
//     product.skinConcern = skinConcern;
//     product.productImage = updatedImages;

//     const updatedProduct = await product.save();

//     res.json({ success: true, message: "Product updated successfully", product: updatedProduct });
//   } catch (error) {
//     console.error("Error updating product:", error.message);
//     res.status(STATUS_CODES.  INTERNAL_SERVER_ERROR).json({ success: false, message: "Error updating product" });
//   }
// };


const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid product ID" });
    }

    const {
      productName,
      description,
      category,
      brand,
      regularPrice,
      quantity,
      skinType,
      skinConcern,
      deletedImages,
    } = req.body;

    if (!productName || !description || !category || !brand || !regularPrice || !quantity || !skinType || !skinConcern) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "All required fields must be provided" });
    }

    if (!mongoose.isValidObjectId(category) || !mongoose.isValidObjectId(brand)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid category or brand ID" });
    }

    if (parseFloat(regularPrice) <= 0) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Regular price must be greater than 0" });
    }

    if (parseInt(quantity) < 0) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Quantity cannot be negative" });
    }

    let deletedImagesArray = [];
    try {
      deletedImagesArray = deletedImages ? JSON.parse(deletedImages) : [];
    } catch (error) {
      console.error("Error parsing deletedImages:", error.message);
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid deletedImages format" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(STATUS_CODES. NOT_FOUND).json({ success: false, message: "Product not found" });
    }

    const foundCategory = await Category.findById(category);
    const foundBrand = await Brand.findById(brand);
    if (!foundCategory || !foundBrand) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Category or brand not found" });
    }

    // Remove deleted images with retry mechanism
    if (deletedImagesArray.length > 0) {
      for (const imageUrl of deletedImagesArray) {
        const imagePath = path.join(__dirname, "../../public", imageUrl);
        let deleted = false;
        let attempts = 0;

        while (!deleted && attempts < 3) {
          try {
            if (fs.existsSync(imagePath)) {
              await fs.promises.unlink(imagePath);
            }
            deleted = true;
          } catch (err) {
            if (err.code === 'EBUSY') {
              console.warn(`Image ${imagePath} is busy, retrying...`);
              await new Promise((resolve) => setTimeout(resolve, STATUS_CODES.  INTERNAL_SERVER_ERROR)); // wait before retry
              attempts++;
            } else {
              console.error(`Failed to delete image ${imagePath}:`, err.message);
              break;
            }
          }
        }

        product.productImage = product.productImage.filter((img) => img !== imageUrl);
      }
    }

    // Process new images with Sharp
    const uploadDir = path.join(__dirname, "../../public/uploads/product-images");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const newImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const isCropped = file.originalname.startsWith('cropped-image-');
        const filename = `${Date.now()}-${file.originalname.replace(/\s/g, "")}.webp`;
        const outputFilePath = path.join(uploadDir, filename);

        await sharp(file.path)
          .resize(800, 800, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 80 })
          .toFile(outputFilePath);

        // Only add the image to newImages if it's a cropped image
        if (isCropped) {
          newImages.push(`/uploads/product-images/${filename}`);
        }

        // Always delete the temporary uploaded file
        fs.unlinkSync(file.path);
      }
    }

    // Update images: keep existing images (minus deleted ones) and add new cropped images
    const updatedImages = [...product.productImage, ...newImages];

    if (updatedImages.length < 4) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "At least 4 images are required" });
    }
    if (updatedImages.length > 8) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Cannot upload more than 8 images" });
    }

    // Update product fields
    product.productName = productName;
    product.description = description;
    product.category = category;
    product.brand = brand;
    product.regularPrice = parseFloat(regularPrice);
    product.quantity = parseInt(quantity);
    product.skinType = skinType;
    product.skinConcern = skinConcern;
    product.productImage = updatedImages;

    const updatedProduct = await product.save();

    res.json({ success: true, message: "Product updated successfully", product: updatedProduct });
  } catch (error) {
    console.error("Error updating product:", error.message);
    res.status(STATUS_CODES.  INTERNAL_SERVER_ERROR).json({ success: false, message: "Error updating product" });
  }
};



const deleteSingleImage = async (req, res) => {
  try {
    const { imageNameToServer, productIdToServer, imageIndex } = req.body;

    if (!mongoose.isValidObjectId(productIdToServer)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ message: 'Invalid product ID', status: false });
    }

    const product = await Product.findById(productIdToServer);
    if (!product) {
      return res.status(STATUS_CODES. NOT_FOUND).json({ message: 'Product not found', status: false });
    }

    if (product.productImage[imageIndex] !== imageNameToServer) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ message: 'Image not found', status: false });
    }

    product.productImage.splice(imageIndex, 1);
    await product.save();

    const filePath = path.join(__dirname, '../../public', imageNameToServer);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ status: true });
  } catch (error) {
    console.error('Error deleting image:', error.message);
    res.status(STATUS_CODES.  INTERNAL_SERVER_ERROR).json({ message: 'Error deleting image', status: false });
  }
};

module.exports = {
  getProductAddPage,
  addProducts,
  getAllProducts,
  addProductOffer,
  editProductOffer,
  removeProductOffer,
  blockProduct,
  unblockProduct,
  geteditProduct,
  updateProduct,
  deleteSingleImage,
};




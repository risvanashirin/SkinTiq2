const Category = require("../../models/categorySchema");
const Product = require('../../models/productSchema');
const STATUS_CODES = require('../../helpers/statusCodes');
const mongoose = require('mongoose');

const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const query = {};
    if (search) {
      query.name = { $regex: `^${search}`, $options: "i" };
    }
    const categoryData = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments(query); // Use query for accurate count
    const totalPages = Math.ceil(totalCategories / limit);

    // Redirect to last page if user lands on an empty page
    if (page > totalPages && totalPages !== 0) {
      return res.redirect(`/admin/category?page=${totalPages}${search ? `&search=${search}` : ''}`);
    }

    res.render("category", {
      categories: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
      search: search
    });
  } catch (error) {
    console.error("Error fetching category info:", error);
    res.redirect('/pageerror');
  }
};

const addCategory = async (req, res) => {
  try {
    const lettersOnlyRegex = /^[A-Za-z\s]+$/;
    const name = req.body.name.trim();
    const description = req.body.description.trim();

    // Empty check
    if (!name || !description) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ message: "Name and description are required" });
    }

    // Letters-only check
    if (!lettersOnlyRegex.test(name)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ message: "Category name must contain characters" });
    }

    if (!lettersOnlyRegex.test(description)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ message: "Description must contain only letters and spaces" });
    }

    // Check for duplicates
    const existingCategory = await Category.findOne({
      name: { $regex: `^${name}$`, $options: 'i' }
    });
    if (existingCategory) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ message: "Category already exists" });
    }

    // Save category
    const newCategory = new Category({ name, description });
    await newCategory.save();

    return res.status(STATUS_CODES.OK).json({ success: true, message: "Category added successfully" });
  } catch (error) {
    console.error("Error adding category:", error.message);
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};



const addCategoryOffer = async (req, res) => {
  try {
    const { percentage, categoryId } = req.body;

    if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ status: false, message: "Invalid category ID" });
    }

    const offerPercentage = parseInt(percentage);
    if (isNaN(offerPercentage) || offerPercentage < 0 || offerPercentage > 99) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ status: false, message: "Offer percentage must be between 0 and 99" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ status: false, message: "Category not found" });
    }

    category.categoryOffer = offerPercentage;
    await category.save();

    // Update products in this category to recalculate salePrice
    const products = await Product.find({ category: category._id });
    for (const product of products) {
      await product.save(); // Triggers pre-save middleware
    }

    res.json({ status: true, message: "Offer added successfully" });
  } catch (error) {
    console.error("Error adding category offer:", error.message);
    res.status(STATUS_CODES .INTERNAL_SERVER_ERROR).json({ status: false, message: "Internal server error" });
  }
};

const editCategoryOffer = async (req, res) => {
  try {
    const { percentage, categoryId } = req.body;

    if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ status: false, message: "Invalid category ID" });
    }

    const offerPercentage = parseInt(percentage);
    if (isNaN(offerPercentage) || offerPercentage < 0 || offerPercentage > 99) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ status: false, message: "Offer percentage must be between 0 and 99" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ status: false, message: "Category not found" });
    }

    category.categoryOffer = offerPercentage;
    await category.save();

    // Update products in this category to recalculate salePrice
    const products = await Product.find({ category: category._id });
    for (const product of products) {
      await product.save(); // Triggers pre-save middleware
    }

    res.json({ status: true, message: "Offer updated successfully" });
  } catch (error) {
    console.error("Error editing category offer:", error.message);
    res.status(STATUS_CODES .INTERNAL_SERVER_ERROR).json({ status: false, message: "Internal server error" });
  }
};

const removeCategoryOffer = async (req, res) => {
  try {
    const { categoryId } = req.body;

    if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ status: false, message: "Invalid category ID" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ status: false, message: "Category not found" });
    }

    category.categoryOffer = 0;
    await category.save();

    // Update products in this category to recalculate salePrice
    const products = await Product.find({ category: category._id });
    for (const product of products) {
      await product.save(); // Triggers pre-save middleware
    }

    res.json({ status: true, message: "Offer removed successfully" });
  } catch (error) {
    console.error("Error removing category offer:", error.message);
    res.status(STATUS_CODES .INTERNAL_SERVER_ERROR).json({ status: false, message: "Internal server error" });
  }
};

const getListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: "Invalid category ID" });
    }
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.status(STATUS_CODES .OK).json({ success: true, message: "Unlisted successfully" });
  } catch (error) {
    console.error("Error unlisting category:", error.message);
    res.redirect("/pageerror");
  }
};

const getUnlistCategory = async (req, res) => {
  try {
    let id = req.query.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: "Invalid category ID" });
    }
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.status(STATUS_CODES .OK).json({ success: true, message: "Listed successfully" });
  } catch (error) {
    console.error("Error listing category:", error.message);
    res.redirect("/pageerror");
  }
};

const getEditCategory = async (req, res) => {
  try {
    const id = req.query.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.redirect("/pageerror");
    }
    const category = await Category.findOne({ _id: id });
    if (!category) {
      return res.redirect("/pageerror");
    }
    res.render("edit-category", { category: category });
  } catch (error) {
    console.error("Error fetching edit category page:", error.message);
    res.redirect("/pageerror");
  }
};

const editCategory = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ message: "Invalid category ID" });
    }
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ message: "Name and description are required" });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: `^${name}$`, $options: 'i' },
      _id: { $ne: id },
    });

    if (existingCategory) {
      return res.status(STATUS_CODES .BAD_REQUEST).json({ message: "Category name already exists" });
    }

    const updateCategory = await Category.findByIdAndUpdate(
      id,
      { name, description },
      { new: true }
    );

    if (!updateCategory) {
      return res.status(STATUS_CODES .NOT_FOUND).json({ error: "Category not found" });
    }

    return res.json({ success: true, message: "Category updated successfully" });
  } catch (error) {
    console.error("Error editing category:", error.message);
    res.status(STATUS_CODES .INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

const updateCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const lettersOnlyRegex = /^[A-Za-z\s]+$/;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ error: "Invalid category ID" });
    }

    const categoryname = req.body.categoryname.trim();
    const description = req.body.description.trim();

    // Empty check
    if (!categoryname || !description) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ error: "Name and description are required" });
    }

    // Letters-only check
    if (!lettersOnlyRegex.test(categoryname)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ error: "Category name must contain characters" });
    }

    if (!lettersOnlyRegex.test(description)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ error: "Description must contain only letters and spaces" });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: categoryname,
        description: description,
      },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(STATUS_CODES.NOT_FOUND).json({ error: "Category not found" });
    }

    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error updating category:", error.message);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
};


module.exports = {
  categoryInfo,
  addCategory,
  addCategoryOffer,
  editCategoryOffer,
  removeCategoryOffer,
  getListCategory,
  getUnlistCategory,
  getEditCategory,
  editCategory,
  updateCategory,
};
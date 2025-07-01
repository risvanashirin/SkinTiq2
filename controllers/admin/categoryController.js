const Category = require("../../models/categorySchema");
const Product = require('../../models/productSchema');
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
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({ message: "Name and description are required" });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: `^${name}$`, $options: 'i' }
    });
    if (existingCategory) {
      return res.status(400).json({ message: "Category already exists" });
    }

    const newCategory = new Category({
      name,
      description,
    });
    await newCategory.save();

    return res.status(200).json({ success: true, message: "Category added successfully" });
  } catch (error) {
    console.error("Error adding category:", error.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};



const addCategoryOffer = async (req, res) => {
  try {
    const { percentage, categoryId } = req.body;

    if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
      return res.status(400).json({ status: false, message: "Invalid category ID" });
    }

    const offerPercentage = parseInt(percentage);
    if (isNaN(offerPercentage) || offerPercentage < 0 || offerPercentage > 99) {
      return res.status(400).json({ status: false, message: "Offer percentage must be between 0 and 99" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
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
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

const editCategoryOffer = async (req, res) => {
  try {
    const { percentage, categoryId } = req.body;

    if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
      return res.status(400).json({ status: false, message: "Invalid category ID" });
    }

    const offerPercentage = parseInt(percentage);
    if (isNaN(offerPercentage) || offerPercentage < 0 || offerPercentage > 99) {
      return res.status(400).json({ status: false, message: "Offer percentage must be between 0 and 99" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
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
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

const removeCategoryOffer = async (req, res) => {
  try {
    const { categoryId } = req.body;

    if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
      return res.status(400).json({ status: false, message: "Invalid category ID" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
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
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

const getListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid category ID" });
    }
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.status(200).json({ success: true, message: "Unlisted successfully" });
  } catch (error) {
    console.error("Error unlisting category:", error.message);
    res.redirect("/pageerror");
  }
};

const getUnlistCategory = async (req, res) => {
  try {
    let id = req.query.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid category ID" });
    }
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.status(200).json({ success: true, message: "Listed successfully" });
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
      return res.status(400).json({ message: "Invalid category ID" });
    }
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({ message: "Name and description are required" });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: `^${name}$`, $options: 'i' },
      _id: { $ne: id },
    });

    if (existingCategory) {
      return res.status(400).json({ message: "Category name already exists" });
    }

    const updateCategory = await Category.findByIdAndUpdate(
      id,
      { name, description },
      { new: true }
    );

    if (!updateCategory) {
      return res.status(404).json({ error: "Category not found" });
    }

    return res.json({ success: true, message: "Category updated successfully" });
  } catch (error) {
    console.error("Error editing category:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateCategory = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid category ID" });
    }
    const { categoryname, description } = req.body;

    if (!categoryname || !description) {
      return res.status(400).json({ error: "Name and description are required" });
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
      return res.status(404).json({ error: "Category not found" });
    }

    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error updating category:", error.message);
    res.status(500).json({ error: "Internal server error" });
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
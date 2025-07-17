
const Brand = require("../../models/brandSchema");
const Product = require('../../models/productSchema');
const STATUS_CODES = require('../../helpers/statusCodes');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_PER_PAGE = 5;

const loadBrandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const search = req.query.search || '';

    const query = search
      ? { brandName: { $regex: search, $options: 'i' } }
      : {};

    const totalBrands = await Brand.countDocuments(query);
    const totalPages = Math.ceil(totalBrands / limit);

    // Redirect to last page if user lands on an empty page
    if (page > totalPages && totalPages !== 0) {
      return res.redirect(`/admin/brand?page=${totalPages}${search ? `&search=${search}` : ''}`);
    }

    const brands = await Brand.find(query)
      .sort({ createdAt: -1 }) // Sort by createdAt in descending order (newest first)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.render("brand", {
      brands,
      currentPage: page,
      totalPages,
      search,
    });
  } catch (err) {
    console.error("Error in loadBrandPage:", err.message);
    res.redirect('/pageerror');
  }
};

const addBrand = async (req, res) => {
    try {
        const { brandName } = req.body;

      
        const brandImage = req.file ? req.file.path : '';

        const existingBrand = await Brand.findOne({ brandName: new RegExp(`^${brandName}$`, 'i') });
        if (existingBrand) {
            return res.json({ success: false, message: 'Brand already exists' });
        }

        const newBrand = new Brand({
            brandName,
            brandImage: brandImage ? [brandImage] : [],
            isListed: true
        });

        await newBrand.save();
        res.json({ success: true, message: 'Brand added successfully' });
    } catch (error) {
        console.error('Error adding brand:', error);
        res.json({ success: false, message: 'Error adding brand' });
    }
};


const editBrand = async (req, res) => {
    try {
        const brandId = req.params.id;
        const { brandName } = req.body;

        const brandImage = req.file ? req.file.path : null; // Cloudinary gives `path` as full URL

        const updateData = { brandName };
        if (brandImage) {
            updateData.brandImage = [brandImage];
        }

        const brand = await Brand.findByIdAndUpdate(brandId, updateData, { new: true });
        if (!brand) {
            return res.json({ success: false, message: 'Brand not found' });
        }

        res.json({ success: true, message: 'Brand updated successfully' });
    } catch (error) {
        console.error('Error updating brand:', error);
        res.json({ success: false, message: 'Error updating brand' });
    }
}; 

const unlistBrand = async (req, res) => {
    try {
        const brandId = req.query.id;
        const brand = await Brand.findByIdAndUpdate(brandId, { isListed: false }, { new: true });
        if (!brand) {
            return res.json({ success: false, message: 'Brand not found' });
        }
        res.json({ success: true, message: 'Brand unlisted successfully' });
    } catch (error) {
        console.error('Error unlisting brand:', error);
        res.json({ success: false, message: 'Error unlisting brand' });
    }
};

const listBrand = async (req, res) => {
    try {
        const brandId = req.query.id;
        const brand = await Brand.findByIdAndUpdate(brandId, { isListed: true }, { new: true });
        if (!brand) {
            return res.json({ success: false, message: 'Brand not found' });
        }
        res.json({ success: true, message: 'Brand listed successfully' });
    } catch (error) {
        console.error('Error listing brand:', error);
        res.json({ success: false, message: 'Error listing brand' });
    }
};



module.exports={
    addBrand,
    editBrand,
    unlistBrand,
    listBrand,
    // deleteBrand,
    loadBrandPage
}





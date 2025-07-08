

const mongoose = require('mongoose');
const Coupon = require('../../models/couponSchema');
const User = require('../../models/userSchema');

const getCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const query = search
            ? { name: { $regex: search, $options: 'i' } }
            : {};

        const totalCoupons = await Coupon.countDocuments(query);
        const totalPages = Math.ceil(totalCoupons / limit);

        // Redirect to last page if user lands on an empty page
        if (page > totalPages && totalPages !== 0) {
            return res.redirect(`/admin/coupon?page=${totalPages}${search ? `&search=${search}` : ''}`);
        }

        const coupons = await Coupon.find(query)
            .select('name createdOn startDate endDate offerPrice minimumPrice isList userId')
            .populate('userId', 'name email')
            .skip(skip)
            .limit(limit)
            .sort({ createdOn: -1 });

        const couponsWithDetails = coupons.map(coupon => ({
            ...coupon._doc,
            isReferral: coupon.name.startsWith('REF-') || coupon.name.startsWith('NEW-'),
            status: coupon.name.startsWith('REF-') || coupon.name.startsWith('NEW-') 
                ? 'Active (Restricted)' 
                : coupon.isList ? 'Active' : 'Inactive',
            assignedUsers: coupon.userId.map(user => ({
                id: user._id,
                name: user.name,
                email: user.email
            }))
        }));

        res.render('admin-coupon', {
            title: 'Coupons',
            coupons: couponsWithDetails,
            currentPage: page,
            totalPages,
            search,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.render('admin-coupon', {
            title: 'Coupons',
            coupons: [],
            currentPage: 1,
            totalPages: 1,
            search: '',
            error: 'Failed to load coupons'
        });
    }
};
// In addCoupon function, after existing validations
const addCoupon = async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ success: false, message: 'Request body is empty' });
        }

        const { name, startDate, endDate, offerPrice, minimumPrice } = req.body;

        if (!name || !startDate || !endDate || !offerPrice || !minimumPrice) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (name.startsWith('REF-') || name.startsWith('NEW-')) {
            return res.status(400).json({ success: false, message: 'Coupon code prefix REF- or NEW- is reserved for referral coupons' });
        }

        if (new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ success: false, message: 'Start date must be before or on end date' });
        }

        if (parseInt(offerPrice) < 1 || parseInt(minimumPrice) < 1) {
            return res.status(400).json({ success: false, message: 'Discount and minimum purchase must be at least 1' });
        }

        if (name.length < 3 || name.length > 20) {
            return res.status(400).json({ success: false, message: 'Coupon code must be 3-20 characters' });
        }

        // New validation for coupon name format
        const nameRegex = /^[A-Za-z0-9_-]+$/;
        if (!nameRegex.test(name)) {
            return res.status(400).json({ success: false, message: 'Coupon code can only contain letters, numbers, hyphens, or underscores' });
        }

        const coupon = new Coupon({
            name: name.toUpperCase(),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            offerPrice: parseInt(offerPrice),
            minimumPrice: parseInt(minimumPrice),
            createdOn: new Date(),
            isList: true,
            userId: []
        });

        await coupon.save();
        res.json({ success: true, message: 'Coupon added successfully' });
    } catch (error) {
        console.error('Error adding coupon:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }
        res.status(500).json({ success: false, message: error.message || 'Failed to add coupon' });
    }
};

// In editCoupon function, after existing validations
const editCoupon = async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ success: false, message: 'Request body is empty' });
        }

        const { name, startDate, endDate, offerPrice, minimumPrice } = req.body;

        if (!name || !startDate || !endDate || !offerPrice || !minimumPrice) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (name.startsWith('REF-') || name.startsWith('NEW-')) {
            return res.status(400).json({ success: false, message: 'Coupon code prefix REF- or NEW- is reserved for referral coupons' });
        }

        if (new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ success: false, message: 'Start date must be before or on end date' });
        }

        if (parseInt(offerPrice) < 1 || parseInt(minimumPrice) < 1) {
            return res.status(400).json({ success: false, message: 'Discount and minimum purchase must be at least 1' });
        }

        if (name.length < 3 || name.length > 20) {
            return res.status(400).json({ success: false, message: 'Coupon code must be 3-20 characters' });
        }

        // New validation for coupon name format
        const nameRegex = /^[A-Za-z0-9_-]+$/;
        if (!nameRegex.test(name)) {
            return res.status(400).json({ success: false, message: 'Coupon code can only contain letters, numbers, hyphens, or underscores' });
        }

        const coupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            {
                name: name.toUpperCase(),
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                offerPrice: parseInt(offerPrice),
                minimumPrice: parseInt(minimumPrice)
            },
            { new: true, runValidators: true }
        );

        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        res.json({ success: true, message: 'Coupon updated successfully' });
    } catch (error) {
        console.error('Error updating coupon:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }
        res.status(500).json({ success: false, message: error.message || 'Failed to update coupon' });
    }
};

const toggleCouponStatus = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        coupon.isList = !coupon.isList;
        await coupon.save();

        res.json({ success: true, message: `Coupon ${coupon.isList ? 'activated' : 'deactivated'}` });
    } catch (error) {
        console.error('Error toggling coupon:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle coupon status' });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        if (coupon.name.startsWith('REF-') || coupon.name.startsWith('NEW-')) {
            return res.status(400).json({ success: false, message: 'Referral coupons cannot be deleted' });
        }

        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Coupon deleted successfully' });
    } catch (error) {
        console.error('Error deleting coupon:', error);
        res.status(500).json({ success: false, message: 'Failed to delete coupon' });
    }
};

module.exports = {
    getCoupons,
    addCoupon,
    editCoupon,
    toggleCouponStatus,
    deleteCoupon
};
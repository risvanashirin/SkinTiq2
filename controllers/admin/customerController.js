
const User = require('../../models/userSchema');
const STATUS_CODES = require('../../helpers/statusCodes');

const mongoose = require('mongoose');

const customerInfo = async (req, res) => {
    try {
      let search = "";
      if (req.query.search) {
        search = req.query.search;
        console.log("Search query:", search);
      }
  
      let page = parseInt(req.query.page) || 1;
      const limit = 3;
  
      const filter = {
        isAdmin: false,
        $or: [
          { name: { $regex: ".*" + search + ".*", $options: "i" } },
          { email: { $regex: ".*" + search + ".*", $options: "i" } }
        ]
      };
  
      const userData = await User.find(filter)
        .sort({ createdOn: -1 }) 
        .skip((page - 1) * limit)
        .limit(limit);
  
      const count = await User.countDocuments(filter); 
      const totalPages = Math.ceil(count / limit);
  
      if (page > totalPages && totalPages !== 0) {
        return res.redirect(`/admin/customers?page=${totalPages}${search ? `&search=${search}` : ""}`);
      }
  
      res.render("customers", {
        data: userData,
        search,
        totalPages,
        currentpage: page,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
  
    } catch (error) {
      console.log("customerInfo error:", error);
      res.redirect("/admin/pageerror");
    }
};

const customerBlocked = async (req, res) => {
    try {
      const id = req.query.id;
      console.log(`Blocking user with ID: ${id}`);
      if (!mongoose.isValidObjectId(id)) {
        console.log(`Invalid user ID: ${id}`);
        return res.status(STATUS_CODES .BAD_REQUEST).json({ message: 'Invalid user ID.' });
      }
      const user = await User.findById(id);
      if (!user) {
        console.log(`User not found: ${id}`);
        return res.status(STATUS_CODES .NOT_FOUND).json({ message: 'User not found.' });
      }
      await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
      res.status(STATUS_CODES .OK).json({ message: 'Customer blocked successfully.' });
    } catch (error) {
      console.error("customerBlocked error:", error);
      res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ message: 'Failed to block customer. Please try again.' });
    }
};

const customerunBlocked = async (req, res) => {
    try {
      const id = req.query.id;
      if (!mongoose.isValidObjectId(id)) {
        console.log(`Invalid user ID: ${id}`);
        return res.status(STATUS_CODES .BAD_REQUEST).json({ message: 'Invalid user ID.' });
      }
      const user = await User.findById(id);
      if (!user) {
        console.log(`User not found: ${id}`);
        return res.status(STATUS_CODES .NOT_FOUND).json({ message: 'User not found.' });
      }
      await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
      console.log(`User unblocked: ${id}`);
      res.status(STATUS_CODES .OK).json({ message: 'Customer unblocked successfully.' });
    } catch (error) {
      console.error("customerunBlocked error:", error);
      res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ message: 'Failed to unblock customer. Please try again.' });
    }
};

module.exports = {
    customerInfo,
    customerBlocked,
    customerunBlocked
};

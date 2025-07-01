const User = require('../../models/userSchema')

const customerInfo = async (req, res) => {
    try {
      let search = "";
      if (req.query.search) {
        search = req.query.search;
        console.log("Search query:", search);
      }
  
      let page = parseInt(req.query.page) || 1;
      const limit = 3;
  
      // Query for non-admin users only
      const filter = {
        isAdmin: false,
        $or: [
          { name: { $regex: ".*" + search + ".*", $options: "i" } },
          { email: { $regex: ".*" + search + ".*", $options: "i" } }
        ]
      };
  
      const userData = await User.find(filter)
        .sort({ createdOn: -1 }) // Sort by createdOn in descending order
        .skip((page - 1) * limit)
        .limit(limit);
  
      // Correct count for pagination
      const count = await User.countDocuments(filter); 
      const totalPages = Math.ceil(count / limit);
  
      // Redirect to last page if user somehow lands on empty page
      if (page > totalPages && totalPages !== 0) {
        return res.redirect(`/admin/customers?page=${totalPages}${search ? `&search=${search}` : ""}`);
      }
  
      res.render("customers", {
        data: userData,
        search,
        totalPages,
        currentpage: page
      });
  
    } catch (error) {
      console.log("customerInfo error", error);
      res.redirect("/admin/pageerror");
    }
};






const customerBlocked = async (req, res) => {
    try {
    let id = req.query.id;
    await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect("/admin/users");
    } catch (error) {
    res.redirect("/pageerror");
    }
    };

    const customerunBlocked = async (req, res) => {
    try {
    let id = req.query.id;
    await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect("/admin/users");
    } catch (error) {
    res.redirect("/pageerror");
    }
    };

module.exports={
    customerInfo,
    customerBlocked,
    customerunBlocked
}
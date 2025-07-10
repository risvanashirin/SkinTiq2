const User = require('../models/userSchema');


const userAuth = (req, res, next) => {
  if (req.session.user) {
    User.findById(req.session.user)
      .then(data => {
        if (data && !data.isBlocked) {
          req.user = data; 
          next();
        } else {
          res.redirect('/login');
        }
      })
      .catch(error => {
        console.error('Error in user auth middleware:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
      });
  } else {
    res.redirect('/login');
  }
};




const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        User.findById(req.session.admin)
        .then(admin => {
            if (admin && admin.isAdmin) { 
               req.admin = admin;
                next();
            } else {
                req.session.destroy();  
                res.redirect('/admin/login');
            }
        })
        .catch(error => {
            console.error("Admin Auth Error", error);
            res.redirect('/admin/login');
        });
    } else {
        res.redirect('/admin/login');
    }
};





const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ success: false, message: 'Unauthorized' });
  };
module.exports = {
  userAuth,
  adminAuth,
  isAuthenticated
  
  
};
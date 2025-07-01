// const multer = require('multer');
// const path = require('path');

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, path.join(__dirname, "../public/uploads/product-images"));
//   },
//   filename: function (req, file, cb) {
//     cb(null, Date.now() + "-" + file.originalname);
//   }
// });

// // Upload ready with field 'images'
// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 10 * 1024 * 1024,
//     fieldSize: 200 * 1024 * 1024
//   }
// }).array('images', 8); // important

// module.exports = upload;




const multer = require('multer');
const path = require('path');

// For product images
const productStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../public/uploads/product-images"));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const productUpload = multer({
  storage: productStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    fieldSize: 200 * 1024 * 1024
  }
});

// For brand images
const brandStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../public/uploads/brands"));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const brandUpload = multer({ storage: brandStorage });

module.exports = {
  productUpload,
  brandUpload
};

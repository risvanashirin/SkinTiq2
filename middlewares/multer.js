const multer = require('multer');
const { ProfileStorage , productStorage, brandStorage } = require('../helpers/cloudinary'); 
 
const ProfileUpload = multer({ storage: ProfileStorage }); 
const productUpload = multer({ storage: productStorage });
const brandUpload = multer({ storage: brandStorage });








module.exports = {ProfileUpload,productUpload,brandUpload};

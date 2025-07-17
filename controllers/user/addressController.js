const Address = require('../../models/addressSchema');
const STATUS_CODES = require('../../helpers/statusCodes');


// Load address page  
const loadAddressPage = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) {
        return res.redirect('/login');
      }
  
      const userAddress = await Address.findOne({ userId }); 
  
      res.render('userAddress', {
        addresses: userAddress?.address || [], 
      });
    } catch (error) {
      console.error('Error loading address page:', error);
      res.redirect('/pageNotFound');
    }
  };
  

// Add new address
const addAddress = async (req, res) => {
    try {
        
        const userId = req.session.user;

        if (!userId) {
            return res.status(STATUS_CODES .UNAUTHORIZED).json({
                success: false,
                message: 'User not authenticated',
            });
        }

        const { addressType, name, city, landMark, state, pincode, phone, altPhone, isPrimary } = req.body;

        if (!name || !city || !landMark || !state || !pincode || !phone) {
            return res.status(STATUS_CODES .BAD_REQUEST).json({
                success: false,
                message: 'All required fields must be filled',
            });
        }

        const newAddressData = {
            addressType,
            name,
            city,
            landMark,
            state,
            pincode,
            phone,
            altPhone: altPhone || '',
            isPrimary: !!isPrimary // Convert to boolean
        };

        console.log("newAddress:", newAddressData);

        let useraddress = await Address.findOne({ userId });

        if (useraddress) {
            console.log("Found existing address document");
            // If setting new address as primary, unset others
            if (isPrimary) {
                useraddress.address.forEach(addr => (addr.isPrimary = false));
            }
            useraddress.address.push(newAddressData);
            await useraddress.save();
        } else {
            console.log("Creating new address document");
            const newAddress = new Address({
                userId,
                address: [newAddressData]
            });
            await newAddress.save();
        }

        // Redirect to address list page or send success response
        res.redirect('/addresses');
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'An error occurred while adding the address',
        });
    }
};

  const useraddressess = async (req, res) => {
    try {
      console.log("add address is working ");
      console.log("req.body", req.body);
  
      const userId = req.session.user;
  
      if (!userId) {
        return res.status(STATUS_CODES .UNAUTHORIZED).json({
          success: false,
          message: 'User not authenticated',
        });
      }
  
      const { name, city, landMark, state, pincode, phone, altPhone } = req.body;
  
      if (!name || !city || !landMark || !state || !pincode || !phone) {
        return res.status(STATUS_CODES .BAD_REQUEST).json({
          success: false,
          message: 'All required fields must be filled',
        });
      }
  
      const newAddressData = {
        name,
        city,
        landMark,
        state,
        pincode,
        phone,
        altPhone: altPhone || '',
      };
  
      console.log("newAddress:", newAddressData);
  
      const useraddress = await Address.findOne({ userId: userId });
  
      if (useraddress) {
        useraddress.address.push(newAddressData);
        await useraddress.save();
      } else {
        const newAddress = new Address({
          userId: userId,
          address: [newAddressData],
        });
        await newAddress.save(); 
      }
  
      res.status(STATUS_CODES .OK).json({
        success: true,
        address: newAddressData,
      });
    } catch (error) {
      console.error('Error adding address:', error);
      res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'An error occurred while adding the address',
      });
    }
  };
  
  

// Get all addresses
const getAddresses = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(STATUS_CODES .UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
    }
    const addresses = await Address.find({ userId });
    res.json({ success: true, addresses });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error fetching addresses' });
  }
};

// Update address
const updateAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(STATUS_CODES .UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
        }

        const addressId = req.params.id;
        const addressData = {
            addressType: req.body.addressType || '',
            name: req.body.name,
            city: req.body.city,
            landMark: req.body.landMark,
            state: req.body.state,
            pincode: req.body.pincode,
            phone: req.body.phone,
            altPhone: req.body.altPhone || '',
            isPrimary: req.body.isPrimary === 'true' || req.body.isPrimary === true
        };

        // Validate required fields
        if (!addressData.name || !addressData.city || !addressData.landMark || !addressData.state || !addressData.pincode || !addressData.phone) {
            return res.status(STATUS_CODES .BAD_REQUEST).json({ success: false, message: 'All required fields must be filled' });
        }

        // Find the address document for the user
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: 'Address document not found' });
        }

        // Find the specific address in the array
        const address = addressDoc.address.id(addressId);
        if (!address) {
            return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: 'Address not found' });
        }

        // If setting as primary, unset other primary addresses
        if (addressData.isPrimary) {
            addressDoc.address.forEach(addr => (addr.isPrimary = false));
        }

        // Update the address fields
        address.set(addressData);

        // Save the updated document
        await addressDoc.save();

        // Redirect to the addresses page
        res.redirect('/addresses');
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error updating address' });
    }
};


// Delete address
const deleteAddress = async (req, res) => {
  
        try {
            const addressId = req.params.id
            const findAddress = await Address.findOne({"address._id":addressId})
            if (!findAddress) {
                return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: "Address not found" })
            }
            await Address.updateOne({"address._id":addressId},{$pull:{address:{_id:addressId}}})
            return res.redirect('/addresses');
        } catch (error) {
            console.error("Error in deleteAddress:", error)
            res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to delete Address " })
        }
    }




const setPrimaryAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(STATUS_CODES .UNAUTHORIZED).json({ success: false, message: 'User not authenticated' });
        }

        const addressId = req.params.id;
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: 'No addresses found for this user' });
        }

        const address = addressDoc.address.id(addressId);
        if (!address) {
            return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: 'Address not found' });
        }

        // Set isPrimary to false for all addresses, then true for the selected one
        addressDoc.address.forEach(addr => (addr.isPrimary = false));
        address.isPrimary = true;

        await addressDoc.save();

        // Redirect to the addresses page
        res.redirect('/addresses');
    } catch (error) {
        console.error('Error setting primary address:', error);
        res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error' });
    }
};




  
  const loadProfilePage = async (req, res) => {
    try {
      const userId = req.user.user;
      const primaryAddress = await Address.findOne({ userId, isPrimary: true });
      res.render('profile', { primaryAddress });
    } catch (error) {
      console.error('Error loading profile page:', error);
      res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).send('Server Error');
    }
  };
  




  const getPrimaryAddress = async (req, res) => {   
    try {
        const userId = req.session.user
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(STATUS_CODES .NOT_FOUND).json({ success: false, message: 'No addresses found.' });
        }
        const primaryAddress = addressDoc.address.find(addr => addr.isPrimary);
        res.json({ success: true, address: primaryAddress || null });
    } catch (error) {
        console.error('Error fetching primary address:', error);
        res.status(STATUS_CODES . INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error.' });
    }
};





module.exports = {
  loadAddressPage,
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  useraddressess,
  setPrimaryAddress,
  loadProfilePage,
  getPrimaryAddress,
};
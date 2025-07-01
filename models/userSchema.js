


const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    name: {
        type: String,
        required: true 
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required: false,
        sparse: true,
        default: null
    },
    googleId: {
        type: String,
        sparse: true
    },
    password: {
        type: String,
        required: false 
    },
    // profilePhoto: {
    //     type: String,
    //     default:  '/uploads/profile/default.jpg' // Added for profile image
    // },
    profilePhoto: {
        type: String,
        default: '/uploads/profile/default.jpg',
        validate: {
            validator: function(v) {
                return v === '/uploads/profile/default.jpg' || /^\/uploads\/profile\/[a-zA-Z0-9-_]+\.(jpg|jpeg|png|webp)$/.test(v);
            },
            message: props => `${props.value} is not a valid profile photo path!`
        }
    },
    addresses: [{
        street: { type: String, required: false },
        city: { type: String, required: false },
        state: { type: String, required: false },
        zip: { type: String, required: false },
        isDefault: { type: Boolean, default: false } // Supports default address
    }], 
    otp: {
        type: String 
    },
    otpExpires: {
        type: Date 
    },
    resetPasswordToken: {
        type: String 
    },
    resetPasswordExpires: {
        type: Date 
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref: "Cart"
    }],
    wallet: {
        type: Number,
        default: 0
    },
    orderHistory: [{
        type: Schema.Types.ObjectId,
        ref: "Order"
    }],
    createdOn: {
        type: Date,
        default: Date.now
    },
    referalCode: {
        type: String
    },
    redeemed: {
        type: Boolean
    },
    tempNewEmail: {
    type: String,
  },
  tempNewPassword: {
    type: String,
  },
    redeemedUsers: [{
        type: Schema.Types.ObjectId,
        ref: "User"
    }]
});

const User = mongoose.model('User', userSchema);
module.exports = User;


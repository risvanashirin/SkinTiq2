

const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Coupon code is required'],
        unique: true,
        uppercase: true,
        trim: true,
        minlength: [3, 'Coupon code must be at least 3 characters'],
        maxlength: [20, 'Coupon code cannot exceed 20 characters']
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: false
    },
    startDate: {
        type: Date,
        required: [false, 'Start date is required'],
        validate: {
            validator: function(value) {
                return this.endDate ? value <= this.endDate : true;
            },
            message: 'Start date must be before or on end date'
        }
    },
    endDate: {
        type: Date,
        required: [false, 'End date is required']
    },
    offerPrice: {
        type: Number,
        required: [false, 'Discount amount is required'],
        min: [1, 'Discount amount must be at least 1']
    },
    minimumPrice: {
        type: Number,
        required: [false, 'Minimum purchase amount is required'],
        min: [150, 'Minimum purchase amount must be at least 150']
    },
    isList: {
        type: Boolean,
        default: true
    },
    userId: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    usedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
});

module.exports = mongoose.model('Coupon', couponSchema);
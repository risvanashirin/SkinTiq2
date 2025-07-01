const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    date: {
        type: Date,
        default: Date.now,
    },
    type: {
        type: String,
        enum: ['Credit', 'Debit'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
    description: {
        type: String,
        trim: true,
    },
    status: {
        type: String,
        enum: ['Completed', 'Pending', 'Failed'],
        default: 'Completed',
    },
});

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true, // Ensure one wallet per user
    },
    balance: {
        type: Number,
        default: 0,
        min: 0,
    },
    transactions: [transactionSchema],
}, {
    timestamps: true,
});

module.exports = mongoose.model('Wallet', walletSchema);





const mongoose = require('mongoose')
const { Schema } = mongoose

const wishlistSchema = new Schema({
    UserId :{
        type:Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    products:[{
        ProductId:{
            type:Schema.Types.ObjectId,
            ref:'Product',
            require:true
        },
        addedOn:{
            type:Date,
            default:Date.now
        }
    }]
})

const Wishlist = mongoose.model('Wishlist',wishlistSchema)
module.exports =Wishlist
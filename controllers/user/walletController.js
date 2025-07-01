const Wallet = require('../../models/walletSchema');



const loadWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.render('wallet', {
                wallet: null,
                error: 'Please log in to view your wallet.',
            });
        }

        // Fetch wallet for the user
        const wallet = await Wallet.findOne({ userId }).lean();
        if (!wallet) {
            return res.render('wallet', {
                wallet: {
                    balance: 0,
                    transactions: [],
                },
                error: 'Wallet not found. Start using your wallet by adding funds or making transactions.',
            });
        }

        // Render wallet page with data
        res.render('wallet', {
            wallet: {
                balance: wallet.balance || 0,
                transactions: wallet.transactions || [],
            },
            error: null,
        });
    } catch (error) {
        console.error('Error loading wallet:', error);
        res.render('wallet', {
            wallet: null,
            error: 'Failed to load wallet details. Please try again later.',
        });
    }
};

module.exports = { loadWallet };




const Wallet = require('../../models/walletSchema');
const STATUS_CODES = require('../../helpers/statusCodes');



const loadWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.render('wallet', {
                wallet: null,
                error: 'Please log in to view your wallet.',
                currentPage: 1,
                totalPages: 0,
                baseUrl: '/wallet',
                queryParams: ''
            });
        }

        const wallet = await Wallet.findOne({ userId }).lean();
        const rowsPerPage = 5;
        const currentPage = parseInt(req.query.page) || 1;
        const baseUrl = '/wallet';
        const queryParams = ''; 

        if (!wallet) {
            return res.render('wallet', {
                wallet: {
                    balance: 0,
                    transactions: [],
                },
                error: 'Wallet not found. Start using your wallet by adding funds or making transactions.',
                currentPage,
                totalPages: 0,
                baseUrl,
                queryParams
            });
        }

        const transactions = wallet.transactions || [];
        const totalPages = Math.ceil(transactions.length / rowsPerPage);

        res.render('wallet', {
            wallet: {
                balance: wallet.balance || 0,
                transactions: transactions,
            },
            error: null,
            currentPage,
            totalPages,
            baseUrl,
            queryParams
        });
    } catch (error) {
        console.error('Error loading wallet:', error);
        res.render('wallet', {
            wallet: null,
            error: 'Failed to load wallet details. Please try again later.',
            currentPage: 1,
            totalPages: 0,
            baseUrl: '/wallet',
            queryParams: ''
        });
    }
};
module.exports = { loadWallet };




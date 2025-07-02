// routes/wallet.routes.js
const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

router.use(verifyToken);

router.get('/balance', walletController.getWalletBalance);
router.post('/topup', walletController.topUpWallet);
router.get('/transactions', walletController.getWalletTransactions);
router.post('/pay', walletController.processWalletPayment);

module.exports = router;
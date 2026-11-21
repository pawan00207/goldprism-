/**
 * GoldPrism Token Economy
 * 
 * Flow: User pays INR via Razorpay → Gold is "purchased" →
 *       Gold trading profits are converted to PRISM tokens →
 *       PRISM tokens can be used to purchase anything on the platform
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');

// --- Constants ---
const GOLD_PRICE_PER_GRAM = parseFloat(process.env.GOLD_PRICE_PER_GRAM || 8500); // INR per gram
const TOKEN_MINT_RATE = parseFloat(process.env.TOKEN_MINT_RATE || 100); // 1 PRISM = ₹100 of gold profit
const TOKEN_NAME = process.env.TOKEN_NAME || 'PRISM';

// In-memory token ledger (replace with Prisma DB in production)
const tokenLedger = new Map(); // userId -> { tokens, goldGrams, transactions[] }

// Initialize Razorpay
let razorpay = null;
function getRazorpay() {
  if (!razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpay;
}

// --- Helper: Get or create user ledger ---
function getLedger(userId) {
  if (!tokenLedger.has(userId)) {
    tokenLedger.set(userId, {
      userId,
      tokens: 0,
      goldGrams: 0,
      investedINR: 0,
      transactions: []
    });
  }
  return tokenLedger.get(userId);
}

/**
 * Create Razorpay order for gold purchase
 * POST /api/tokens/buy-gold
 * Body: { userId, amountINR }
 */
async function createGoldPurchaseOrder(req, res) {
  const rz = getRazorpay();
  if (!rz) {
    return res.status(503).json({ success: false, error: 'Razorpay not configured' });
  }

  const { userId = 'guest', amountINR } = req.body;
  if (!amountINR || amountINR < 100) {
    return res.status(400).json({ success: false, error: 'Minimum purchase ₹100' });
  }

  try {
    const order = await rz.orders.create({
      amount: Math.round(amountINR * 100), // paise
      currency: 'INR',
      receipt: `gp_gold_${userId}_${Date.now()}`,
      notes: {
        userId,
        type: 'GOLD_PURCHASE',
        goldGrams: (amountINR / GOLD_PRICE_PER_GRAM).toFixed(4),
        platform: 'GoldPrism'
      }
    });

    res.json({
      success: true,
      order,
      goldGrams: (amountINR / GOLD_PRICE_PER_GRAM).toFixed(4),
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      message: `Purchasing ${(amountINR / GOLD_PRICE_PER_GRAM).toFixed(4)}g of gold for ₹${amountINR}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Verify Razorpay payment & credit gold to user
 * POST /api/tokens/verify-payment
 * Body: { userId, razorpay_order_id, razorpay_payment_id, razorpay_signature, amountINR }
 */
function verifyPaymentAndCreditGold(req, res) {
  const { userId = 'guest', razorpay_order_id, razorpay_payment_id, razorpay_signature, amountINR } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Missing payment verification fields' });
  }

  // Verify signature
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(body)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Payment signature verification failed' });
  }

  // Credit gold
  const goldGrams = amountINR / GOLD_PRICE_PER_GRAM;
  const ledger = getLedger(userId);
  ledger.goldGrams += goldGrams;
  ledger.investedINR += amountINR;
  ledger.transactions.push({
    type: 'GOLD_PURCHASE',
    amountINR,
    goldGrams,
    paymentId: razorpay_payment_id,
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: `✅ Payment verified! ${goldGrams.toFixed(4)}g gold credited.`,
    ledger: {
      userId: ledger.userId,
      goldGrams: ledger.goldGrams.toFixed(4),
      tokens: ledger.tokens,
      investedINR: ledger.investedINR
    }
  });
}

/**
 * Convert gold trading profit to PRISM tokens
 * POST /api/tokens/mint
 * Body: { userId, profitINR }
 * 1 PRISM token = ₹100 of profit
 */
function mintTokensFromProfit(req, res) {
  const { userId = 'guest', profitINR } = req.body;
  if (!profitINR || profitINR <= 0) {
    return res.status(400).json({ success: false, error: 'profitINR must be positive' });
  }

  const tokensToMint = Math.floor(profitINR / TOKEN_MINT_RATE);
  if (tokensToMint === 0) {
    return res.status(400).json({ success: false, error: `Minimum ₹${TOKEN_MINT_RATE} profit needed to mint 1 ${TOKEN_NAME} token` });
  }

  const ledger = getLedger(userId);
  ledger.tokens += tokensToMint;
  ledger.transactions.push({
    type: 'TOKEN_MINT',
    profitINR,
    tokensMinted: tokensToMint,
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: `🪙 ${tokensToMint} ${TOKEN_NAME} tokens minted from ₹${profitINR} profit!`,
    tokensMinted: tokensToMint,
    totalTokens: ledger.tokens,
    remainingProfit: profitINR % TOKEN_MINT_RATE
  });
}

/**
 * Spend PRISM tokens for a purchase
 * POST /api/tokens/spend
 * Body: { userId, tokens, description }
 */
function spendTokens(req, res) {
  const { userId = 'guest', tokens, description = 'Platform purchase' } = req.body;
  if (!tokens || tokens <= 0) {
    return res.status(400).json({ success: false, error: 'tokens must be positive' });
  }

  const ledger = getLedger(userId);
  if (ledger.tokens < tokens) {
    return res.status(400).json({
      success: false,
      error: `Insufficient ${TOKEN_NAME} tokens. Have: ${ledger.tokens}, Need: ${tokens}`
    });
  }

  ledger.tokens -= tokens;
  ledger.transactions.push({
    type: 'TOKEN_SPEND',
    tokensSpent: tokens,
    description,
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: `✅ ${tokens} ${TOKEN_NAME} tokens spent on: ${description}`,
    tokensSpent: tokens,
    remainingTokens: ledger.tokens,
    valueINR: tokens * TOKEN_MINT_RATE
  });
}

/**
 * Get user wallet (gold + tokens)
 * GET /api/tokens/wallet/:userId
 */
function getWallet(req, res) {
  const { userId = 'guest' } = req.params;
  const ledger = getLedger(userId);
  res.json({
    success: true,
    wallet: {
      userId: ledger.userId,
      goldGrams: parseFloat(ledger.goldGrams.toFixed(4)),
      goldValueINR: parseFloat((ledger.goldGrams * GOLD_PRICE_PER_GRAM).toFixed(2)),
      [TOKEN_NAME + '_tokens']: ledger.tokens,
      tokenValueINR: ledger.tokens * TOKEN_MINT_RATE,
      investedINR: ledger.investedINR,
      transactions: ledger.transactions.slice(-20) // last 20
    },
    rates: {
      goldPricePerGram: GOLD_PRICE_PER_GRAM,
      tokenMintRate: `1 ${TOKEN_NAME} = ₹${TOKEN_MINT_RATE} profit`,
      tokenName: TOKEN_NAME
    }
  });
}

/**
 * Get token economy summary (platform-wide)
 * GET /api/tokens/summary
 */
function getTokenSummary(req, res) {
  let totalGold = 0, totalTokens = 0, totalUsers = 0, totalInvested = 0;
  for (const ledger of tokenLedger.values()) {
    totalGold += ledger.goldGrams;
    totalTokens += ledger.tokens;
    totalInvested += ledger.investedINR;
    totalUsers++;
  }

  res.json({
    success: true,
    economy: {
      totalUsers,
      totalGoldGrams: parseFloat(totalGold.toFixed(4)),
      totalGoldValueINR: parseFloat((totalGold * GOLD_PRICE_PER_GRAM).toFixed(2)),
      totalTokensCirculating: totalTokens,
      totalTokenValueINR: totalTokens * TOKEN_MINT_RATE,
      totalInvestedINR: totalInvested,
      tokenName: TOKEN_NAME,
      tokenMintRate: TOKEN_MINT_RATE,
      goldPricePerGram: GOLD_PRICE_PER_GRAM
    }
  });
}

module.exports = {
  createGoldPurchaseOrder,
  verifyPaymentAndCreditGold,
  mintTokensFromProfit,
  spendTokens,
  getWallet,
  getTokenSummary
};

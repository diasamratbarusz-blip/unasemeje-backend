const mongoose = require('mongoose');
const knowledgeBase = require('../knowledge_base.json');

// Import your existing models
const User = require('../models/User');
const Order = require('../models/Order');
const Service = require('../models/Service');

// Access the Security models (Registered in server.js)
const ChatLog = mongoose.model('ChatLog');
const ChatBan = mongoose.model('ChatBan');

// ==========================================
// HELPER: PRICING LOGIC (Ensures Provider Secrecy)
// ==========================================
function applyFinalPrice(originalRate, name) {
    const t = String(name).toLowerCase();
    let markup = 40;
    if (t.includes("like")) markup = 30;
    if (t.includes("follower")) markup = 25;
    if (t.includes("view")) markup = 35;
    return Number((Number(originalRate || 0) + markup).toFixed(2));
}

// ==========================================
// MAIN CONTROLLER (NOW ASYNC FOR DB QUERIES)
// ==========================================
const getAIResponse = async (req, res) => {
    const userMessage = req.body.message;
    const userId = req.user ? req.user.id : null; // Extracted from auth middleware

    if (!userMessage || typeof userMessage !== 'string') {
        return res.status(400).json({ success: false, error: "A valid message string is required." });
    }

    // 🛡️ 1. SECURITY CHECK: Is the user banned from chatting?
    if (userId) {
        try {
            const activeBan = await ChatBan.findOne({ userId, expiresAt: { $gt: Date.now() } });
            if (activeBan) {
                const daysLeft = Math.ceil((activeBan.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
                return res.json({ 
                    success: true, 
                    reply: `🚫 **Chat Restricted:** You have been restricted from using the AI Support chat for violating our terms of service. You can chat again in ${daysLeft} day(s). If you need further assistance, please use the 'Human Support' form.`,
                    isBanned: true 
                });
            }
        } catch (err) { console.warn("Ban check error:", err); }
    }

    // 📊 2. Fetch real-time user data for dynamic AI responses
    let userBalance = 0;
    let activeOrders = 0;
    if (userId) {
        try {
            const user = await User.findById(userId);
            if (user) {
                userBalance = user.balance || 0;
                activeOrders = await Order.countDocuments({ userId: userId, status: { $in: ['pending', 'processing'] } });
            }
        } catch (err) { console.warn("AI Context Error."); }
    }

    // 🧠 3. Process AI with context
    let aiReply = processInternalAI(userMessage, { balance: userBalance, activeOrders });
    
    // 🛒 4. DYNAMIC LIVE SERVICE SEARCH (STRICT PROVIDER SECRECY)
    const cleanMsg = userMessage.toLowerCase();
    const serviceKeywords = ["service", "services", "menu", "tiktok", "instagram", "youtube", "facebook", "twitter", "telegram", "followers", "views", "likes", "subscribers", "price", "prices", "cost", "catalog", "sell"];
    const isAskingForServices = serviceKeywords.some(k => cleanMsg.includes(k));

    if (isAskingForServices) {
        try {
            let query = {};
            // Smart platform detection based on user's message
            if (cleanMsg.includes('tiktok') || cleanMsg.includes('tt')) query.platform = "TikTok";
            else if (cleanMsg.includes('instagram') || cleanMsg.includes('ig') || cleanMsg.includes('insta')) query.platform = "Instagram";
            else if (cleanMsg.includes('youtube') || cleanMsg.includes('yt')) query.platform = "YouTube";
            else if (cleanMsg.includes('facebook') || cleanMsg.includes('fb')) query.platform = "Facebook";
            else if (cleanMsg.includes('twitter') || cleanMsg.includes('x')) query.platform = "Twitter/X";
            else if (cleanMsg.includes('telegram') || cleanMsg.includes('tg')) query.platform = "Telegram";

            let services = [];
            if (Object.keys(query).length > 0) {
                services = await Service.find(query).limit(5); // Get top 5 for that specific platform
            } else {
                services = await Service.aggregate([{ $sample: { size: 5 } }]); // Get 5 random services if no platform specified
            }

            if (services.length > 0) {
                aiReply += "\n\n📋 **Here is a quick preview of our live services & prices:**\n";
                services.forEach(s => {
                    // Calculate the exact price the user will pay (includes your markup)
                    const finalRate = applyFinalPrice(s.rate, s.name);
                    
                    // 🔒 STRICT SECURITY LOCK: We ONLY output the Name, Platform, and Price. 
                    // We completely ignore all other database fields to ensure the provider is NEVER revealed.
                    aiReply += `• **${s.name}** (${s.platform}) - KES ${finalRate}/1k\n`;
                });
                aiReply += "\n💡 *Visit the **New Order** page to see the full menu and place your order!*";
            } else {
                aiReply += "\n\n📋 *Our database is updating right now! Please visit the **New Order** page to see the full live catalog.*";
            }
        } catch (err) {
            console.error("AI Service Fetch Error:", err);
        }
    }

    // 📝 5. LOGGING: Save the conversation to the database for Admin review
    if (userId) {
        try {
            await ChatLog.create({
                userId,
                userEmail: req.user.email || "Unknown",
                username: req.user.username || "Unknown",
                userMessage,
                aiReply
            });
        } catch (err) { console.error("Failed to save chat log:", err); }
    }

    res.json({ 
        success: true, 
        reply: aiReply,
        timestamp: new Date().toISOString()
    });
};

// ==========================================
// THE INTERNAL AI ENGINE (Fuzzy Matching + Real-Time Context)
// ==========================================
function processInternalAI(message, context = {}) {
    const cleanMessage = message.toLowerCase().replace(/[^\w\s]/gi, '').trim();
    let bestMatch = null;
    let highestScore = 0;

    for (const item of knowledgeBase.knowledge_base) {
        let score = 0;
        for (const keyword of item.keywords) {
            const cleanKeyword = keyword.toLowerCase();
            
            // 1. Exact phrase match (Highest priority)
            if (cleanMessage.includes(cleanKeyword)) {
                score += cleanKeyword.split(' ').length * 15; 
            } 
            // 2. Fuzzy Word Overlap (Catches typos & slang)
            else {
                const msgWords = cleanMessage.split(' ');
                const keyWords = cleanKeyword.split(' ');
                let overlap = 0;
                for (const mw of msgWords) {
                    for (const kw of keyWords) {
                        if (mw.length > 2 && kw.length > 2) {
                            if (mw.startsWith(kw.substring(0, 3)) || kw.startsWith(mw.substring(0, 3)) || mw.includes(kw) || kw.includes(mw)) {
                                overlap++;
                            }
                        }
                    }
                }
                if (overlap > 0) score += overlap * 8;
            }
        }
        
        if (score > highestScore) {
            highestScore = score;
            bestMatch = item;
        }
    }

    // If we have a confident match
    if (bestMatch && highestScore >= 5) {
        let finalAnswer = bestMatch.answer;
        
        // INJECT REAL-TIME DATABASE DATA IF NEEDED
        if (bestMatch.action === 'fetch_balance') {
            finalAnswer = finalAnswer.replace('{balance}', Number(context.balance).toLocaleString('en-KE', { minimumFractionDigits: 2 }));
        } else if (bestMatch.action === 'fetch_orders') {
            finalAnswer = finalAnswer.replace('{active_orders}', context.activeOrders);
        }
        
        return finalAnswer;
    }
    
    // Creative Fallback
    return "🤔 Hmm, I'm not entirely sure about that one! You can ask me about:\n• 💰 Adding funds or checking your balance\n• 🚀 How to place an order\n• 📦 Tracking your active orders\n• 🎁 Referral bonuses\n\nOr click 'Human Support' to message the Admin directly!";
}

module.exports = { getAIResponse };

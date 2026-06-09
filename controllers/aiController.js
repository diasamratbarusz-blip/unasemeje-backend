const knowledgeBase = require('../knowledge_base.json');

// Main controller function for the API route
const getAIResponse = (req, res) => {
    const userMessage = req.body.message;
    
    if (!userMessage || typeof userMessage !== 'string') {
        return res.status(400).json({ success: false, error: "A valid message string is required." });
    }

    // Process the message through the internal AI logic
    const aiReply = processInternalAI(userMessage);
    
    res.json({ 
        success: true, 
        reply: aiReply,
        timestamp: new Date().toISOString()
    });
};

// ==========================================
// THE INTERNAL AI ENGINE (No External APIs)
// ==========================================
function processInternalAI(message) {
    // 1. Clean the message: lowercase, remove punctuation, trim whitespace
    const cleanMessage = message.toLowerCase().replace(/[^\w\s]/gi, '').trim();
    
    let bestMatch = null;
    let highestScore = 0;

    // 2. Loop through every item in your knowledge base
    for (const item of knowledgeBase.knowledge_base) {
        let score = 0;
        
        // 3. Check for keyword matches
        for (const keyword of item.keywords) {
            const cleanKeyword = keyword.toLowerCase();
            
            // SCENARIO A: Exact phrase match (Highest priority)
            // e.g., "add funds" matches "i want to add funds"
            if (cleanMessage.includes(cleanKeyword)) {
                // Weight longer phrases higher (e.g., "add funds" = 20 pts, "add" = 10 pts)
                score += cleanKeyword.split(' ').length * 10; 
            } 
            // SCENARIO B: Partial word match (Fallback for typos/plurals)
            // e.g., "deposit" matches "deposits"
            else {
                const messageWords = cleanMessage.split(' ');
                for (const word of messageWords) {
                    // Only match words longer than 2 letters to avoid false positives (like "a" or "i")
                    if (word.length > 2 && (cleanKeyword.includes(word) || word.includes(cleanKeyword))) {
                        score += 3; 
                    }
                }
            }
        }

        // 4. Keep track of the highest scoring match
        if (score > highestScore) {
            highestScore = score;
            bestMatch = item;
        }
    }

    // 5. Return the answer if a confident match was found, otherwise return a fallback
    // We require a minimum score of 5 to prevent random single-word matches from triggering
    if (bestMatch && highestScore >= 5) {
        return bestMatch.answer;
    }
    
    // Fallback response if the AI doesn't understand
    return "I'm not entirely sure I understand that. Could you rephrase your question? You can also type 'help' to see what I can assist you with!";
}

module.exports = { getAIResponse };

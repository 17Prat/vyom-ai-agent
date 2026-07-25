// ==================== core/SmartResponseController.js ====================

export class SmartResponseController {
    constructor() {
        // Question types detection
        this.questionTypes = {
            yesNo: /^(kya|hai|hain|the|thi|kiya|kare|kar|ho|hoga|hogee|rehte|rehta|rahe)/i,
            what: /^(kya|kaun|kiska|kiski|kisne|kyu|kyon|kab|kahan|kaise|kitna|kitne)/i,
            confirm: /^(sahi|galat|true|false|haan|nahi|jee|nhi|the|thi|hain|hai)\?/i,
            simple: /^(kya hai|kaise hai|kyu hai|kab hai|kahan hai)/i
        };

        // Topic categories
        this.topicCategories = {
            history: ['itihas', 'history', 'purana', 'pehle', 'tha', 'the'],
            place: ['ayodhya', 'vindhya', 'ganga', 'nepal', 'india', 'bharat'],
            person: ['ram', 'sita', 'laxman', 'hanuman', 'dasharath'],
            event: ['janm', 'vivah', 'vanvas', 'yudh', 'raaj']
        };

        // Response templates
        this.templates = {
            confirm: {
                yes: "Haan 🙏 {topic} {detail}",
                no: "Nahi ❌ {topic} {detail}",
                short: "{topic} {detail}"
            },
            what: {
                short: "{topic} {detail}",
                medium: "{topic} {detail} Aur bhi jaante hain?",
                detailed: "{topic} {detail} {extra}"
            }
        };
    }

    async generateResponse(userMessage, userHistory) {
        // Step 1: Detect question type
        const questionType = this.detectQuestionType(userMessage);
        
        // Step 2: Detect if it's a confirmation question
        const isConfirm = this.isConfirmationQuestion(userMessage);
        
        // Step 3: Detect topic and intent
        const topic = this.extractTopic(userMessage);
        const intent = this.detectIntent(userMessage);
        
        // Step 4: Check if repeat question
        const isRepeat = this.checkRepeat(userMessage, userHistory);
        
        // Step 5: Generate appropriate response
        let response;
        
        if (isConfirm && !isRepeat) {
            // Simple confirmation needed
            response = this.generateConfirmationResponse(topic, userMessage);
        } else if (isRepeat) {
            // Already asked before
            response = this.generateRepeatResponse(topic, userHistory);
        } else {
            // Normal response with appropriate length
            response = await this.generateNormalResponse(topic, intent, userMessage);
        }
        
        // Step 6: Length control
        response = this.controlLength(response, questionType);
        
        return response;
    }

    // ========== DETECTION METHODS ==========

    detectQuestionType(message) {
        const lower = message.toLowerCase();
        
        if (this.questionTypes.confirm.test(lower)) {
            return 'confirm';
        }
        if (this.questionTypes.yesNo.test(lower)) {
            return 'yesno';
        }
        if (this.questionTypes.what.test(lower)) {
            return 'what';
        }
        if (this.questionTypes.simple.test(lower)) {
            return 'simple';
        }
        return 'unknown';
    }

    isConfirmationQuestion(message) {
        const lower = message.toLowerCase();
        // Check if asking for confirmation
        const confirmWords = ['kya', 'hai', 'hain', 'the', 'thi', 'rahe', 'rehte'];
        const questionMark = message.includes('?') || message.includes('??');
        
        // Check if it's a yes/no question
        if (confirmWords.some(w => lower.includes(w)) && questionMark) {
            // Check length - short questions usually need short answers
            if (message.split(' ').length < 15) {
                return true;
            }
        }
        
        // Check for confirmation phrases
        const confirmPhrases = [
            'kya yeh', 'kya woh', 'kya ram', 'kya sita',
            'sahi hai', 'galat hai', 'the kya', 'thi kya'
        ];
        
        return confirmPhrases.some(p => lower.includes(p));
    }

    detectIntent(message) {
        const lower = message.toLowerCase();
        
        if (lower.includes('itihas') || lower.includes('history') || lower.includes('purana')) {
            return 'history';
        }
        if (lower.includes('kaise') || lower.includes('kya hai') || lower.includes('kya tha')) {
            return 'explain';
        }
        if (lower.includes('kab') || lower.includes('kahan') || lower.includes('kaun')) {
            return 'fact';
        }
        if (lower.includes('bhakti') || lower.includes('puja') || lower.includes('mandir')) {
            return 'religious';
        }
        return 'general';
    }

    extractTopic(message) {
        const lower = message.toLowerCase();
        
        // Extract main topic
        const topics = {
            ram: ['ram', 'shri ram', 'prabhu ram', 'bhagwan ram'],
            sita: ['sita', 'janaki', 'maata sita'],
            ayodhya: ['ayodhya', 'ajodhya'],
            hanuman: ['hanuman', 'hanuman ji', 'bajrang bali'],
            dasharath: ['dasharath', 'dashrath']
        };
        
        for (const [topic, keywords] of Object.entries(topics)) {
            if (keywords.some(k => lower.includes(k))) {
                return topic;
            }
        }
        
        return 'unknown';
    }

    checkRepeat(message, userHistory) {
        if (!userHistory || userHistory.length === 0) return false;
        
        const lastQuestion = userHistory[userHistory.length - 1]?.content || '';
        const similarity = this.calculateSimilarity(message, lastQuestion);
        
        return similarity > 0.7; // 70% similar = repeat
    }

    calculateSimilarity(str1, str2) {
        const words1 = str1.toLowerCase().split(' ');
        const words2 = str2.toLowerCase().split(' ');
        const common = words1.filter(w => words2.includes(w));
        return common.length / Math.max(words1.length, words2.length);
    }

    // ========== RESPONSE GENERATION ==========

    generateConfirmationResponse(topic, message) {
        // For yes/no questions - short response
        const isPositive = this.isPositiveQuestion(message);
        
        let detail = '';
        switch (topic) {
            case 'ram':
                detail = isPositive ? 
                    '🙏 Shri Ram Ji Ayodhya mein rehte the. Ayodhya unka janmabhoomi hai.' :
                    '❌ Nahi, Shri Ram Ji Ayodhya mein rehte the.';
                break;
            case 'ayodhya':
                detail = isPositive ?
                    'Haan, Ayodhya Shri Ram Ji ka janmabhoomi hai.' :
                    '❌ Nahi, Ayodhya Shri Ram Ji ka janmabhoomi hai.';
                break;
            default:
                detail = isPositive ?
                    'Haan, aap sahi hain.' :
                    'Nahi, aap galat hain.';
        }
        
        return {
            text: detail,
            type: 'confirm',
            length: 20
        };
    }

    generateRepeatResponse(topic, userHistory) {
        let response = `Aapne pehle yeh puchha tha. Kya specific angle se jaanna chahte ho?`;
        
        return {
            text: response,
            type: 'repeat',
            length: 30
        };
    }

    async generateNormalResponse(topic, intent, message) {
        // Determine if user wants detail
        const wantsDetail = this.wantsDetail(message);
        
        let response;
        if (wantsDetail) {
            response = await this.getDetailedResponse(topic, intent);
        } else {
            response = await this.getShortResponse(topic, intent);
        }
        
        return response;
    }

    wantsDetail(message) {
        const detailWords = ['detail', 'depth', 'explain', 'itihas', 'pura', 'sab', 'poorna'];
        return detailWords.some(w => message.toLowerCase().includes(w));
    }

    async getShortResponse(topic, intent) {
        // Short response (30-50 words)
        const responses = {
            ram: 'Shri Ram Ji Ayodhya mein rehte the. Ayodhya unka janmabhoomi hai. Unhone apna bachpan aur yuva avastha yahan bitayi.',
            ayodhya: 'Ayodhya Shri Ram Ji ka janmabhoomi hai. Yeh Uttar Pradesh mein sthit ek pavitra shehar hai.',
            sita: 'Mata Sita Shri Ram Ji ki patni thi. Unhone bhi Ayodhya mein samay bitaya.',
            hanuman: 'Hanuman Ji Shri Ram Ji ke bhakt the. Unhone Ayodhya mein bhi samay bitaya.'
        };
        
        return {
            text: responses[topic] || `${topic} ke baare mein jaante hain.`,
            type: 'short',
            length: 40
        };
    }

    async getDetailedResponse(topic, intent) {
        // Medium response (100-150 words)
        const responses = {
            ram: 'Shri Ram Ji Ayodhya mein rehte the. Ayodhya unka janmabhoomi hai. Unhone apna bachpan, yuva avastha, aur apne pitaji Dasharath ke saath samay yahan bitaya. Ayodhya mein unka janm, unki shiksha, aur unki patni Sita se vivah hua. Aaj bhi Ayodhya mein Ram Janmabhoomi mandir hai, jo unki yaad dilata hai.',
            ayodhya: 'Ayodhya Shri Ram Ji ka janmabhoomi hai. Yeh Uttar Pradesh mein sthit hai. Yahan Ram Janmabhoomi mandir, Hanuman Garhi, Kanak Bhavan, aur Nageshwar Nath mandir hain. Lakhon bhakton ka yahan aana hota hai.'
        };
        
        return {
            text: responses[topic] || `${topic} ke baare mein jaante hain.`,
            type: 'medium',
            length: 120
        };
    }

    // ========== LENGTH CONTROL ==========

    controlLength(response, questionType) {
        // If it's a confirmation question, keep it short
        if (questionType === 'confirm' || questionType === 'yesno') {
            if (response.text.split(' ').length > 50) {
                // Shorten
                const sentences = response.text.split(/[.!?]+/);
                response.text = sentences.slice(0, 2).join('. ') + '.';
                response.length = 30;
                response.shortened = true;
            }
        }
        
        return response;
    }

    isPositiveQuestion(message) {
        const positiveWords = ['hai', 'the', 'thi', 'rahe', 'rehte', 'hain', 'ho', 'hoga'];
        const negativeWords = ['nahi', 'nhi', 'na', 'galat', 'wrong', 'false'];
        
        const lower = message.toLowerCase();
        if (negativeWords.some(w => lower.includes(w))) {
            return false;
        }
        return positiveWords.some(w => lower.includes(w));
    }
}

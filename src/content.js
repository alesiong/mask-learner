import kuromoji from 'kuromoji';

class WordMasker {
    constructor() {
        this.maskedWords = new Map();
        this.isActive = false;
        this.maskingPercentage = 0.1; // Default value
        this.minWordLength = 2; // Reduced for CJK characters
        this.tokenizer = null;
        this.wordStats = {
            total: 0,
            correct: 0,
            wrong: 0,
            unsure: 0
        };
        this.initializeTokenizer();
        this.loadMaskingPercentage();
        this.loadStats();
    }

    async loadMaskingPercentage() {
        const result = await chrome.storage.local.get(['maskingPercentage']);
        if (result.maskingPercentage) {
            this.maskingPercentage = result.maskingPercentage / 100;
        }
    }

    async initializeTokenizer() {
        try {
            this.tokenizer = await new Promise((resolve, reject) => {
                kuromoji.builder({ dicPath: chrome.runtime.getURL('dict/') }).build((err, tokenizer) => {
                    if (err) {
                        console.error('Failed to initialize tokenizer:', err);
                        reject(err);
                    } else {
                        resolve(tokenizer);
                    }
                });
            });
        } catch (error) {
            console.error('Tokenizer initialization failed:', error);
        }
    }

    async loadStats() {
        const result = await chrome.storage.local.get(['wordStats']);
        if (result.wordStats) {
            this.wordStats = result.wordStats;
            this.updateStats();
        }
    }

    saveStats() {
        chrome.storage.local.set({ wordStats: this.wordStats });
        this.updateStats();
    }

    updateStats() {
        chrome.runtime.sendMessage({
            action: 'updateStats',
            stats: this.wordStats
        });
    }

    init() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'toggle') {
                this.toggleMasking();
                sendResponse({ status: 'success', isActive: this.isActive });
            } else if (request.action === 'updatePercentage') {
                this.maskingPercentage = request.percentage;
                if (this.isActive) {
                    this.revealAllWords();
                    this.maskWords();
                }
                sendResponse({ status: 'success' });
            }
        });
    }

    toggleMasking() {
        this.isActive = !this.isActive;
        if (this.isActive) {
            this.maskWords();
        } else {
            this.revealAllWords();
        }
    }

    getTextNodes(element = document.body) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip script and style elements
                    if (node.parentElement.tagName === 'SCRIPT' ||
                        node.parentElement.tagName === 'STYLE') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Only accept nodes with actual text content
                    return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                }
            }
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        return textNodes;
    }

    isCJKCharacter(char) {
        const code = char.charCodeAt(0);
        return (
            (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified Ideographs
            (code >= 0x3400 && code <= 0x4DBF) || // CJK Extension A
            (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
            (code >= 0x2A700 && code <= 0x2B73F) || // CJK Extension C
            (code >= 0x2B740 && code <= 0x2B81F) || // CJK Extension D
            (code >= 0x2B820 && code <= 0x2CEAF) || // CJK Extension E
            (code >= 0x2CEB0 && code <= 0x2EBEF) || // CJK Extension F
            (code >= 0x3040 && code <= 0x309F) || // Hiragana
            (code >= 0x30A0 && code <= 0x30FF) || // Katakana
            (code >= 0x31F0 && code <= 0x31FF) || // Katakana Phonetic Extensions
            (code >= 0xAC00 && code <= 0xD7AF)    // Hangul Syllables
        );
    }

    shouldMaskCharacter(char) {
        // Don't mask punctuation or whitespace
        if (/[\s\u3000-\u303F\uFF00-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/.test(char)) {
            return false;
        }

        // For CJK characters, only mask if it's a valid character
        if (this.isCJKCharacter(char)) {
            return true;
        }

        // For non-CJK characters, only mask if it's a letter
        return /[a-zA-Z\u00C0-\u00FF]/.test(char);
    }

    splitText(text) {
        const segments = [];
        let currentSegment = '';
        let isCJK = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charIsCJK = this.isCJKCharacter(char);

            if (i === 0) {
                isCJK = charIsCJK;
                currentSegment = char;
            } else if (charIsCJK === isCJK) {
                currentSegment += char;
            } else {
                segments.push(currentSegment);
                currentSegment = char;
                isCJK = charIsCJK;
            }
        }

        if (currentSegment) {
            segments.push(currentSegment);
        }

        return segments;
    }

    isJapanese(text) {
        // Check if text contains Japanese characters
        return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text);
    }

    isChinese(text) {
        // Check if text contains Chinese characters
        return /[\u4E00-\u9FFF]/.test(text) && !this.isJapanese(text);
    }

    segmentJapanese(text) {
        if (!this.tokenizer) return [text];
        const tokens = this.tokenizer.tokenize(text);
        return tokens.map(token => token.surface_form);
    }

    segmentChinese(text) {
        // Simple Chinese word segmentation based on common patterns
        // This is a basic implementation and might need improvement
        const segments = [];
        let currentSegment = '';

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            // Add current character to segment
            currentSegment += char;

            // Check if we should split here
            if (
                // End of text
                !nextChar ||
                // Next character is punctuation
                /[\u3000-\u303F\uFF00-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/.test(nextChar) ||
                // Next character is not Chinese
                !/[\u4E00-\u9FFF]/.test(nextChar) ||
                // Current character is punctuation
                /[\u3000-\u303F\uFF00-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/.test(char)
            ) {
                if (currentSegment) {
                    segments.push(currentSegment);
                    currentSegment = '';
                }
            }
        }

        if (currentSegment) {
            segments.push(currentSegment);
        }

        return segments;
    }

    shouldMaskWord(word) {
        // Don't mask punctuation or whitespace
        if (/[\s\u3000-\u303F\uFF00-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/.test(word)) {
            return false;
        }

        // For CJK words, only mask if it's a valid word
        if (this.isJapanese(word) || this.isChinese(word)) {
            return word.length >= this.minWordLength;
        }

        // For non-CJK words, only mask if it's a valid word
        return word.length >= this.minWordLength && /^[\w\u00C0-\u00FF]+$/.test(word);
    }

    maskWords() {
        const textNodes = this.getTextNodes();
        textNodes.forEach(node => {
            const text = node.textContent;
            let segments = [];

            if (this.isJapanese(text)) {
                segments = this.segmentJapanese(text);
            } else if (this.isChinese(text)) {
                segments = this.segmentChinese(text);
            } else {
                segments = text.split(/(\s+)/);
            }

            const maskedContent = segments.map(segment => {
                if (this.shouldMaskWord(segment) && Math.random() < this.maskingPercentage) {
                    const maskId = `mask-${Math.random().toString(36).substr(2, 9)}`;
                    this.maskedWords.set(maskId, segment);
                    this.wordStats.total++;
                    this.saveStats();

                    const maskLength = segment.length;
                    const maskChar = '█'.repeat(maskLength);

                    return `<span class="masked-word" data-mask-id="${maskId}">
                            <span class="mask">${maskChar}</span>
                            <div class="assessment-popup">
                                <button class="assessment-btn correct">✓</button>
                                <button class="assessment-btn wrong">✗</button>
                                <button class="assessment-btn unsure">?</button>
                            </div>
                           </span>`;
                }
                return segment;
            }).join('');

            const span = document.createElement('span');
            span.innerHTML = maskedContent;
            node.parentNode.replaceChild(span, node);
        });

        this.attachEventListeners();
    }

    attachEventListeners() {
        let currentPopup = null;
        let hideTimeout = null;

        document.addEventListener('mouseover', (e) => {
            if (e.target.classList.contains('mask')) {
                // Clear any pending hide timeout
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }

                // Hide previous popup if any
                if (currentPopup && currentPopup !== e.target.parentElement.querySelector('.assessment-popup')) {
                    currentPopup.style.display = 'none';
                }

                // Show new popup
                const popup = e.target.parentElement.querySelector('.assessment-popup');
                if (popup) {
                    popup.style.display = 'flex';
                    currentPopup = popup;
                }
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.classList.contains('mask')) {
                const popup = e.target.parentElement.querySelector('.assessment-popup');
                if (popup) {
                    // Set a timeout to hide the popup
                    hideTimeout = setTimeout(() => {
                        popup.style.display = 'none';
                        currentPopup = null;
                    }, 300); // Small delay to allow moving to popup
                }
            }
        });

        // Prevent popup from hiding when hovering over it
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest('.assessment-popup')) {
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.closest('.assessment-popup')) {
                const popup = e.target.closest('.assessment-popup');
                if (popup) {
                    hideTimeout = setTimeout(() => {
                        popup.style.display = 'none';
                        currentPopup = null;
                    }, 300);
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('assessment-btn')) {
                const maskContainer = e.target.closest('.masked-word');
                const maskId = maskContainer.dataset.maskId;

                if (e.target.classList.contains('correct')) {
                    maskContainer.classList.add('correct-guess');
                    this.wordStats.correct++;
                } else if (e.target.classList.contains('wrong')) {
                    maskContainer.classList.add('wrong-guess');
                    this.wordStats.wrong++;
                } else if (e.target.classList.contains('unsure')) {
                    maskContainer.classList.add('unsure-guess');
                    this.wordStats.unsure++;
                }

                this.saveStats();
                const popup = e.target.closest('.assessment-popup');
                if (popup) {
                    popup.style.display = 'none';
                    currentPopup = null;
                }
            }
        });
    }

    revealAllWords() {
        const maskedElements = document.querySelectorAll('.masked-word');
        maskedElements.forEach(element => {
            const maskId = element.dataset.maskId;
            const originalWord = this.maskedWords.get(maskId);
            element.outerHTML = originalWord;
        });
        this.maskedWords.clear();
        this.wordStats = {
            total: 0,
            correct: 0,
            wrong: 0,
            unsure: 0
        };
        this.saveStats();
    }
}

const wordMasker = new WordMasker();
wordMasker.init();
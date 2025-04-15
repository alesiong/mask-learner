class WordMasker {
    constructor() {
        this.maskedWords = new Map();
        this.isActive = false;
        this.maskingPercentage = 0.1; // 10% of words will be masked
        this.minWordLength = 2; // Reduced for CJK characters
    }

    init() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'toggle') {
                this.toggleMasking();
                sendResponse({ status: 'success', isActive: this.isActive });
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

    maskWords() {
        const textNodes = this.getTextNodes();
        textNodes.forEach(node => {
            const segments = this.splitText(node.textContent);
            const maskedContent = segments.map(segment => {
                // For CJK characters, mask individual characters
                if (this.isCJKCharacter(segment[0])) {
                    return segment.split('').map(char => {
                        if (this.shouldMaskCharacter(char) && Math.random() < this.maskingPercentage) {
                            const maskId = `mask-${Math.random().toString(36).substr(2, 9)}`;
                            this.maskedWords.set(maskId, char);
                            return `<span class="masked-word" data-mask-id="${maskId}">
                                    <span class="mask">█</span>
                                   </span>`;
                            // <input type="text" class="guess-input" placeholder="猜">
                        }
                        return char;
                    }).join('');
                }
                // For non-CJK text, use the original word-based masking
                else {
                    const words = segment.split(/(\s+)/);
                    return words.map(word => {
                        if (word.trim().length >= this.minWordLength &&
                            Math.random() < this.maskingPercentage &&
                            /^[\w\u00C0-\u00FF]+$/.test(word)) {

                            const maskId = `mask-${Math.random().toString(36).substr(2, 9)}`;
                            this.maskedWords.set(maskId, word);

                            return `<span class="masked-word" data-mask-id="${maskId}">
                                    <span class="mask">█████</span>
                                   </span>`;
                            // <input type="text" class="guess-input" placeholder="Guess">
                        }
                        return word;
                    }).join('');
                }
            }).join('');

            const span = document.createElement('span');
            span.innerHTML = maskedContent;
            node.parentNode.replaceChild(span, node);
        });

        this.attachEventListeners();
    }

    attachEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('mask')) {
                const maskContainer = e.target.closest('.masked-word');
                const maskId = maskContainer.dataset.maskId;
                const originalWord = this.maskedWords.get(maskId);
                e.target.textContent = originalWord;
            }
        });

        document.addEventListener('keypress', (e) => {
            if (e.target.classList.contains('guess-input') && e.key === 'Enter') {
                const maskContainer = e.target.closest('.masked-word');
                const maskId = maskContainer.dataset.maskId;
                const originalWord = this.maskedWords.get(maskId);
                const guess = e.target.value.trim();

                if (guess === originalWord) {
                    maskContainer.classList.add('correct-guess');
                    maskContainer.querySelector('.mask').textContent = originalWord;
                } else {
                    maskContainer.classList.add('incorrect-guess');
                    setTimeout(() => {
                        maskContainer.classList.remove('incorrect-guess');
                    }, 1000);
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
    }
}

const wordMasker = new WordMasker();
wordMasker.init();
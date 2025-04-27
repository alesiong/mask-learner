document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.getElementById('toggleButton');
    const statusText = document.getElementById('status');
    const maskingPercentageSlider = document.getElementById('maskingPercentage');
    const percentageValue = document.getElementById('percentageValue');
    const totalWordsElement = document.getElementById('totalWords');
    const correctWordsElement = document.getElementById('correctWords');
    const wrongWordsElement = document.getElementById('wrongWords');
    const unsureWordsElement = document.getElementById('unsureWords');
    let isActive = false;

    // Load saved masking percentage
    chrome.storage.local.get(['maskingPercentage', 'wordStats'], function(result) {
        if (result.maskingPercentage) {
            maskingPercentageSlider.value = result.maskingPercentage;
            percentageValue.textContent = `${result.maskingPercentage}%`;
        }
        if (result.wordStats) {
            updateStatsDisplay(result.wordStats);
        }
    });

    // Handle slider changes
    maskingPercentageSlider.addEventListener('input', function() {
        const value = this.value;
        percentageValue.textContent = `${value}%`;
        chrome.storage.local.set({ maskingPercentage: value });

        // If masking is active, update the content script
        if (isActive) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'updatePercentage',
                    percentage: value / 100
                });
            });
        }
    });

    toggleButton.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'toggle'}, function(response) {
                if (response && response.status === 'success') {
                    isActive = response.isActive;
                    updateUI();
                }
            });
        });
    });

    function updateUI() {
        if (isActive) {
            toggleButton.textContent = 'Stop Masking';
            toggleButton.classList.add('active');
            statusText.textContent = 'Masking is active';
        } else {
            toggleButton.textContent = 'Start Masking';
            toggleButton.classList.remove('active');
            statusText.textContent = 'Click to start masking words';
        }
    }

    function updateStatsDisplay(stats) {
        totalWordsElement.textContent = stats.total;
        correctWordsElement.textContent = stats.correct;
        wrongWordsElement.textContent = stats.wrong;
        unsureWordsElement.textContent = stats.unsure;
    }

    // Listen for stats updates
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateStats') {
            updateStatsDisplay(request.stats);
        }
    });
});
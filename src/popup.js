document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.getElementById('toggleButton');
    const statusText = document.getElementById('status');
    const maskingPercentageSlider = document.getElementById('maskingPercentage');
    const percentageValue = document.getElementById('percentageValue');
    let isActive = false;

    // Load saved masking percentage
    chrome.storage.local.get(['maskingPercentage'], function(result) {
        if (result.maskingPercentage) {
            maskingPercentageSlider.value = result.maskingPercentage;
            percentageValue.textContent = `${result.maskingPercentage}%`;
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
});
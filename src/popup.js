document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.getElementById('toggleButton');
    const statusText = document.getElementById('status');
    let isActive = false;

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
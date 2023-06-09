console.log('I am background script')
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    fetch(request, { method: "GET" })
        .then(response => response.blob())
        .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => sendResponse({ status: true, data: reader.result });
            reader.onerror = error => {
                console.error('Error occurred while reading blob:', error);
                sendResponse({ status: false, error: error.toString() });
            };
            reader.readAsDataURL(blob);
        })
        .catch(error => {
            console.error('Error occurred while fetching image:', error);
            sendResponse({ status: false, error: error.toString() });
        });

    return true;  // Indicates that the response will be sent asynchronously
});

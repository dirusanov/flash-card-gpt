console.log('I am background script');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  fetch(request, { method: "GET" })
    .then(response => response.blob())
    .then(blob => {
      console.log('Blob fetched successfully.');
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log('Blob read successfully.');
        sendResponse({ status: true, data: reader.result });
      };
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

console.log('Background script has been loaded.');

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked. Sending message to content script...');
  chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending message:', chrome.runtime.lastError.message);
    } else {
      console.log('Response from content script:', response);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleSidebar') {
    chrome.tabs.sendMessage(sender.tab.id, { action: 'toggleSidebar' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError.message);
        sendResponse({ status: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ status: true, response });
      }
    });
    return true; // Keeps the message channel open for sendResponse
  }
});

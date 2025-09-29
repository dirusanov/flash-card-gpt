console.log('I am background script');

const configureActionForTab = (tab) => {
  if (!tab || tab.id === undefined) {
    return;
  }

  const url = tab.url || '';
  const isHttpPage = url.startsWith('http://') || url.startsWith('https://');

  if (isHttpPage) {
    chrome.action.setPopup({ tabId: tab.id, popup: '' });
    chrome.action.setTitle({ tabId: tab.id, title: 'Toggle Sidebar' });
  } else {
    chrome.action.setPopup({ tabId: tab.id, popup: 'popup.html' });
    chrome.action.setTitle({ tabId: tab.id, title: 'Расширение недоступно на этой странице' });
  }
};

const refreshActiveTabAction = () => {
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Error querying tabs:', chrome.runtime.lastError.message);
      return;
    }

    const [activeTab] = tabs;
    configureActionForTab(activeTab);
  });
};

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting tab on activation:', chrome.runtime.lastError.message);
      return;
    }

    configureActionForTab(tab);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || !tab.active) {
    return;
  }

  if (changeInfo.status === 'complete' || changeInfo.url) {
    configureActionForTab(tab);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  refreshActiveTabAction();
});

refreshActiveTabAction();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  
  // Обработка запросов на получение изображений
  if (typeof request === 'string' && request.startsWith('http')) {
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
  }
  
  // Обработка запросов на получение tabId
  if (request.action === 'getTabId') {
    const tabId = sender.tab ? sender.tab.id : null;
    console.log('Returning tab ID:', tabId);
    sendResponse({ tabId });
    return true;
  }
});

console.log('Background script has been loaded.');

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked. Sending message to content script...');
  chrome.tabs.sendMessage(tab.id, { 
    action: 'toggleSidebar',
    tabId: tab.id 
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending message:', chrome.runtime.lastError.message);
    } else {
      console.log('Response from content script:', response);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleSidebar') {
    const tabId = sender.tab ? sender.tab.id : null;
    chrome.tabs.sendMessage(sender.tab.id, { 
      action: 'toggleSidebar',
      tabId: tabId 
    }, (response) => {
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

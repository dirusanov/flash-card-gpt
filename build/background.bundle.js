console.log("I am background script"),chrome.runtime.onMessage.addListener(((e,r,o)=>(console.log("Message received:",e),fetch(e,{method:"GET"}).then((e=>e.blob())).then((e=>{console.log("Blob fetched successfully.");const r=new FileReader;r.onloadend=()=>{console.log("Blob read successfully."),o({status:!0,data:r.result})},r.onerror=e=>{console.error("Error occurred while reading blob:",e),o({status:!1,error:e.toString()})},r.readAsDataURL(e)})).catch((e=>{console.error("Error occurred while fetching image:",e),o({status:!1,error:e.toString()})})),!0))),console.log("Background script has been loaded."),chrome.action.onClicked.addListener((e=>{console.log("Extension icon clicked. Sending message to content script..."),chrome.tabs.sendMessage(e.id,{action:"toggleSidebar"},(e=>{chrome.runtime.lastError?console.error("Error sending message:",chrome.runtime.lastError.message):console.log("Response from content script:",e)}))})),chrome.runtime.onMessage.addListener(((e,r,o)=>{if("toggleSidebar"===e.action)return chrome.tabs.sendMessage(r.tab.id,{action:"toggleSidebar"},(e=>{chrome.runtime.lastError?(console.error("Error sending message:",chrome.runtime.lastError.message),o({status:!1,error:chrome.runtime.lastError.message})):o({status:!0,response:e})})),!0}));
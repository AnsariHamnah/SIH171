console.log("[SIH-26171] Offscreen document loaded");
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[SIH-26171] Offscreen received message:", message.type);
  sendResponse({ received: true });
  return true;
});
//# sourceMappingURL=offscreen.js.map

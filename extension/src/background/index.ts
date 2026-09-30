console.log('[SIH-26171] Background service worker loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[SIH-26171] Extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SIH-26171] Background received message:', message.type);
  sendResponse({ received: true });
  return true;
});
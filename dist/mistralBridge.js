"use strict";
(() => {
  // src/content/mistralBridge.ts
  var REQ_SOURCE = "aether-shroud-mistral-page";
  var RES_SOURCE = "aether-shroud-mistral-content";
  var TARGET_HOSTNAME = "chat.mistral.ai";
  var TARGET_PATHNAME = "/api/trpc/message.newChat";
  function log(...args) {
    console.log("[AETHER][mistralBridge]", ...args);
  }
  function warn(...args) {
    console.warn("[AETHER][mistralBridge]", ...args);
  }
  function requestMaskText(pending, nextRequestIdRef, text) {
    return new Promise((resolve) => {
      const requestId = nextRequestIdRef.value++;
      log("requesting mask", { requestId, textLength: text.length });
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        warn("mask request timed out", { requestId });
        resolve(null);
      }, 1500);
      pending.set(requestId, (maskedText) => {
        window.clearTimeout(timer);
        resolve(maskedText);
      });
      window.postMessage(
        {
          source: REQ_SOURCE,
          kind: "maskForRequest",
          requestId,
          text
        },
        "*"
      );
    });
  }
  function installBridge() {
    if (window.__aetherMistralFetchBridgeInstalled || window.location.hostname !== TARGET_HOSTNAME) {
      return;
    }
    window.__aetherMistralFetchBridgeInstalled = true;
    log("installed", { href: window.location.href });
    const pending = /* @__PURE__ */ new Map();
    const nextRequestIdRef = { value: 1 };
    window.addEventListener(
      "message",
      (event) => {
        if (event.source !== window) {
          return;
        }
        const data = event.data;
        if (!data || data.source !== RES_SOURCE || data.kind !== "maskForRequestResult" || typeof data.requestId !== "number") {
          return;
        }
        const resolve = pending.get(data.requestId);
        if (!resolve) {
          warn("received unknown requestId", data.requestId);
          return;
        }
        pending.delete(data.requestId);
        log("received masked text", {
          requestId: data.requestId,
          textLength: data.maskedText?.length ?? 0
        });
        resolve(typeof data.maskedText === "string" ? data.maskedText : null);
      },
      false
    );
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      try {
        const urlValue = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const targetUrl = new URL(urlValue, window.location.href);
        if (targetUrl.hostname !== TARGET_HOSTNAME || targetUrl.pathname !== TARGET_PATHNAME || typeof init?.body !== "string") {
          return originalFetch(input, init);
        }
        log("intercepted target fetch", {
          pathname: targetUrl.pathname,
          bodyLength: init.body.length
        });
        let parsedBody;
        try {
          parsedBody = JSON.parse(init.body);
        } catch {
          warn("failed to parse request body as JSON");
          return originalFetch(input, init);
        }
        const contentItems = parsedBody?.[0]?.json?.content;
        if (!Array.isArray(contentItems)) {
          warn("request JSON shape unexpected; content array missing");
          return originalFetch(input, init);
        }
        let changed = false;
        for (const item of contentItems) {
          if (!item || typeof item !== "object") {
            continue;
          }
          const typedItem = item;
          if (typedItem.type !== "text" || typeof typedItem.text !== "string") {
            continue;
          }
          const maskedText = await requestMaskText(pending, nextRequestIdRef, typedItem.text);
          if (typeof maskedText === "string" && maskedText.length > 0 && maskedText !== typedItem.text) {
            typedItem.text = maskedText;
            changed = true;
            log("masked content item", { textLength: maskedText.length });
          }
        }
        if (!changed) {
          log("no content item changed; forwarding original request");
          return originalFetch(input, init);
        }
        const headers = new Headers(init.headers);
        headers.delete("content-length");
        const nextInit = {
          ...init,
          headers,
          body: JSON.stringify(parsedBody)
        };
        log("forwarding rewritten request");
        return originalFetch(input, nextInit);
      } catch {
        warn("unexpected bridge error; forwarding original request");
        return originalFetch(input, init);
      }
    };
  }
  installBridge();
})();
//# sourceMappingURL=mistralBridge.js.map

function getAttributes(element) {
  const attrs = {};
  const attributes = element.attributes;
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    attrs[attr.name] = attr.value;
  }
  return attrs;
}
function getBoundingBox(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}
function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }
  return true;
}
function isElementInViewport(element) {
  const rect = element.getBoundingClientRect();
  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && rect.right <= (window.innerWidth || document.documentElement.clientWidth);
}
function isInteractiveElement(element) {
  const tagName = element.tagName.toLowerCase();
  const interactiveTags = ["a", "button", "input", "select", "textarea", "option", "optgroup"];
  if (interactiveTags.includes(tagName)) {
    return true;
  }
  const role = element.getAttribute("role");
  const interactiveRoles = ["button", "link", "menuitem", "tab", "checkbox", "radio", "slider", "spinbutton", "textbox", "searchbox", "combobox", "listbox", "option", "menuitemcheckbox", "menuitemradio"];
  if (role && interactiveRoles.includes(role)) {
    return true;
  }
  if (element.hasAttribute("tabindex") && element.getAttribute("tabindex") !== "-1") {
    return true;
  }
  if (element.hasAttribute("contenteditable") && element.getAttribute("contenteditable") !== "false") {
    return true;
  }
  return false;
}
function getRole(element) {
  const role = element.getAttribute("role");
  if (role) return role;
  const tagName = element.tagName.toLowerCase();
  const implicitRoles = {
    "a": "link",
    "button": "button",
    "input": "textbox",
    "select": "combobox",
    "textarea": "textbox",
    "img": "img",
    "h1": "heading",
    "h2": "heading",
    "h3": "heading",
    "h4": "heading",
    "h5": "heading",
    "h6": "heading",
    "form": "form",
    "nav": "navigation",
    "main": "main",
    "article": "article",
    "section": "region",
    "aside": "complementary",
    "header": "banner",
    "footer": "contentinfo"
  };
  return implicitRoles[tagName] || null;
}
function getAriaLabel(element) {
  var _a;
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  const ariaLabelledBy = element.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const labelElement = document.getElementById(ariaLabelledBy);
    if (labelElement) return ((_a = labelElement.textContent) == null ? void 0 : _a.trim()) || null;
  }
  return null;
}
function getInputType(element) {
  if (element.tagName.toLowerCase() === "input") {
    return element.getAttribute("type") || "text";
  }
  return null;
}
function getAutocomplete(element) {
  return element.getAttribute("autocomplete");
}
function getFormId(element) {
  const form = element.form;
  if (form) return form.id || "";
  return null;
}
function getLabelText(element) {
  var _a, _b;
  if (element.tagName.toLowerCase() === "input" || element.tagName.toLowerCase() === "textarea" || element.tagName.toLowerCase() === "select") {
    const input = element;
    if (input.labels && input.labels.length > 0) {
      return ((_a = input.labels[0].textContent) == null ? void 0 : _a.trim()) || null;
    }
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return ((_b = label.textContent) == null ? void 0 : _b.trim()) || null;
    }
  }
  return null;
}
function getTextContent(element) {
  var _a;
  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return element.value;
  }
  return ((_a = element.textContent) == null ? void 0 : _a.trim()) || null;
}
function extractDOMElements() {
  const elements = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  let node = walker.nextNode();
  while (node) {
    const element = node;
    const tagName = element.tagName.toLowerCase();
    const skipTags = ["script", "style", "noscript", "meta", "link", "head", "title"];
    if (skipTags.includes(tagName)) {
      node = walker.nextNode();
      continue;
    }
    const extracted = {
      element,
      tagName: element.tagName,
      attributes: getAttributes(element),
      boundingBox: getBoundingBox(element),
      textContent: getTextContent(element),
      isInteractive: isInteractiveElement(element),
      role: getRole(element),
      ariaLabel: getAriaLabel(element),
      inputType: getInputType(element),
      autocomplete: getAutocomplete(element),
      formId: getFormId(element),
      labelText: getLabelText(element),
      isVisible: isElementVisible(element),
      isInViewport: isElementInViewport(element)
    };
    elements.push(extracted);
    node = walker.nextNode();
  }
  return elements;
}
function toDOMElementMetadata(extracted, piiDetections = []) {
  return {
    tagName: extracted.tagName,
    attributes: extracted.attributes,
    boundingBox: extracted.boundingBox,
    textContent: extracted.textContent || void 0,
    isInteractive: extracted.isInteractive,
    isVisible: extracted.isVisible,
    piiDetections
  };
}
function createDetection$1(type, element, reason, severity = "high") {
  const selector = generateSelector$1(element.element);
  return {
    type,
    source: "layer1_typed_field",
    confidence: 0.95,
    location: {
      selector,
      boundingBox: element.boundingBox
    },
    originalValue: element.textContent || void 0,
    reason,
    severity
  };
}
function generateSelector$1(element) {
  if (element.id) {
    return `#${element.id}`;
  }
  const parts = [];
  let current = element;
  while (current && current !== document.body) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
      parts.unshift(part);
      break;
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((el) => el.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}
const PASSWORD_TYPES = ["password"];
const PASSWORD_AUTOCOMPLETE = ["current-password", "new-password", "one-time-code"];
const EMAIL_TYPES = ["email"];
const EMAIL_AUTOCOMPLETE = ["email", "username"];
const PHONE_TYPES = ["tel"];
const PHONE_AUTOCOMPLETE = ["tel", "tel-national", "tel-area-code", "tel-country-code", "tel-local", "tel-local-prefix", "tel-local-suffix", "tel-extension"];
const CREDIT_CARD_AUTOCOMPLETE = ["cc-number", "cc-name", "cc-exp", "cc-exp-month", "cc-exp-year", "cc-csc", "cc-type"];
const SSN_AUTOCOMPLETE = ["ssn"];
const ADDRESS_AUTOCOMPLETE = [
  "street-address",
  "address-line1",
  "address-line2",
  "address-line3",
  "address-level1",
  "address-level2",
  "address-level3",
  "address-level4",
  "postal-code",
  "country",
  "country-name"
];
const NAME_AUTOCOMPLETE = ["name", "given-name", "additional-name", "family-name", "honorific-prefix", "honorific-suffix", "nickname"];
const ARIA_SENSITIVE_ROLES = ["password", "searchbox"];
const ARIA_SENSITIVE_LABELS = [
  "password",
  "passcode",
  "pin",
  "secret",
  "ssn",
  "social security",
  "credit card",
  "card number",
  "cvv",
  "cvc",
  "expiration",
  "email",
  "e-mail",
  "phone",
  "telephone",
  "mobile",
  "address",
  "street",
  "zip",
  "postal"
];
function detectLayer1(extractedElements) {
  var _a, _b, _c, _d, _e;
  const detections = [];
  for (const element of extractedElements) {
    if (!element.isVisible) continue;
    const tagName = element.tagName.toLowerCase();
    const inputType = ((_a = element.inputType) == null ? void 0 : _a.toLowerCase()) || "";
    const autocomplete = ((_b = element.autocomplete) == null ? void 0 : _b.toLowerCase()) || "";
    const role = ((_c = element.role) == null ? void 0 : _c.toLowerCase()) || "";
    const ariaLabel = ((_d = element.ariaLabel) == null ? void 0 : _d.toLowerCase()) || "";
    const labelText = ((_e = element.labelText) == null ? void 0 : _e.toLowerCase()) || "";
    if (tagName === "input" || tagName === "textarea") {
      if (PASSWORD_TYPES.includes(inputType) || PASSWORD_AUTOCOMPLETE.some((ac) => autocomplete.includes(ac))) {
        detections.push(createDetection$1("password", element, `Input type="${inputType}" or autocomplete="${autocomplete}" indicates password field`, "critical"));
        continue;
      }
      if (EMAIL_TYPES.includes(inputType) || EMAIL_AUTOCOMPLETE.some((ac) => autocomplete.includes(ac))) {
        detections.push(createDetection$1("email", element, `Input type="${inputType}" or autocomplete="${autocomplete}" indicates email field`, "high"));
        continue;
      }
      if (PHONE_TYPES.includes(inputType) || PHONE_AUTOCOMPLETE.some((ac) => autocomplete.includes(ac))) {
        detections.push(createDetection$1("phone", element, `Input type="${inputType}" or autocomplete="${autocomplete}" indicates phone field`, "high"));
        continue;
      }
      if (CREDIT_CARD_AUTOCOMPLETE.some((ac) => autocomplete.includes(ac))) {
        detections.push(createDetection$1("credit_card", element, `autocomplete="${autocomplete}" indicates credit card field`, "critical"));
        continue;
      }
      if (SSN_AUTOCOMPLETE.some((ac) => autocomplete.includes(ac))) {
        detections.push(createDetection$1("ssn", element, `autocomplete="${autocomplete}" indicates SSN field`, "critical"));
        continue;
      }
      if (ADDRESS_AUTOCOMPLETE.some((ac) => autocomplete.includes(ac))) {
        detections.push(createDetection$1("address", element, `autocomplete="${autocomplete}" indicates address field`, "medium"));
        continue;
      }
      if (NAME_AUTOCOMPLETE.some((ac) => autocomplete.includes(ac))) {
        detections.push(createDetection$1("name", element, `autocomplete="${autocomplete}" indicates name field`, "medium"));
        continue;
      }
    }
    if (role === "password" || ARIA_SENSITIVE_ROLES.includes(role)) {
      detections.push(createDetection$1("password", element, `role="${role}" indicates password field`, "critical"));
      continue;
    }
    const combinedLabels = `${ariaLabel} ${labelText}`.toLowerCase();
    for (const sensitiveLabel of ARIA_SENSITIVE_LABELS) {
      if (combinedLabels.includes(sensitiveLabel)) {
        let type = "unknown";
        if (["password", "passcode", "pin", "secret"].includes(sensitiveLabel)) type = "password";
        else if (["ssn", "social security"].includes(sensitiveLabel)) type = "ssn";
        else if (["credit card", "card number", "cvv", "cvc", "expiration"].includes(sensitiveLabel)) type = "credit_card";
        else if (["email", "e-mail"].includes(sensitiveLabel)) type = "email";
        else if (["phone", "telephone", "mobile"].includes(sensitiveLabel)) type = "phone";
        else if (["address", "street", "zip", "postal"].includes(sensitiveLabel)) type = "address";
        if (type !== "unknown") {
          detections.push(createDetection$1(type, element, `ARIA label or associated label contains "${sensitiveLabel}"`, "high"));
          break;
        }
      }
    }
  }
  return { detections };
}
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEXES = [
  /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
  /\b\+?[1-9]\d{1,14}\b/g
];
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;
const SSN_REGEX = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g;
const ADDRESS_REGEXES = [
  /\b\d+\s+[A-Za-z0-9\s.,'-]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|circle|cir|highway|hwy)\b/gi,
  /\b(?:PO Box|P\.O\. Box)\s+\d+\b/gi
];
function findMatches(text, regex) {
  const matches = [];
  let match;
  const globalRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  while ((match = globalRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      match: match[0]
    });
    if (!globalRegex.global) break;
  }
  return matches;
}
function isLuhnValid(cardNumber) {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}
function createDetection(type, element, textOffset, matchedText, reason, severity = "medium") {
  const selector = generateSelector(element.element);
  return {
    type,
    source: "layer2_regex",
    confidence: 0.8,
    location: {
      selector,
      boundingBox: element.boundingBox,
      textOffset
    },
    originalValue: matchedText,
    reason,
    severity
  };
}
function generateSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }
  const parts = [];
  let current = element;
  while (current && current !== document.body) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
      parts.unshift(part);
      break;
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((el) => el.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}
function detectLayer2(extractedElements) {
  const detections = [];
  for (const element of extractedElements) {
    if (!element.isVisible) continue;
    const text = element.textContent || "";
    if (!text || text.length === 0) continue;
    const emailMatches = findMatches(text, EMAIL_REGEX);
    for (const match of emailMatches) {
      detections.push(createDetection(
        "email",
        element,
        match,
        match.match,
        `Email pattern matched: ${match.match}`,
        "high"
      ));
    }
    for (const phoneRegex of PHONE_REGEXES) {
      const phoneMatches = findMatches(text, phoneRegex);
      for (const match of phoneMatches) {
        detections.push(createDetection(
          "phone",
          element,
          match,
          match.match,
          `Phone pattern matched: ${match.match}`,
          "high"
        ));
      }
    }
    const ccMatches = findMatches(text, CREDIT_CARD_REGEX);
    for (const match of ccMatches) {
      const digitsOnly = match.match.replace(/\D/g, "");
      if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && isLuhnValid(digitsOnly)) {
        detections.push(createDetection(
          "credit_card",
          element,
          match,
          match.match,
          `Credit card pattern matched (Luhn valid): ${match.match}`,
          "critical"
        ));
      }
    }
    const ssnMatches = findMatches(text, SSN_REGEX);
    for (const match of ssnMatches) {
      detections.push(createDetection(
        "ssn",
        element,
        match,
        match.match,
        `SSN pattern matched: ${match.match}`,
        "critical"
      ));
    }
    for (const addressRegex of ADDRESS_REGEXES) {
      const addressMatches = findMatches(text, addressRegex);
      for (const match of addressMatches) {
        detections.push(createDetection(
          "address",
          element,
          match,
          match.match,
          `Address pattern matched: ${match.match}`,
          "medium"
        ));
      }
    }
  }
  return { detections };
}
function runDetectionPipeline(extractedElements) {
  const layer1Result = detectLayer1(extractedElements);
  const layer2Result = detectLayer2(extractedElements);
  const allDetections = [
    ...layer1Result.detections,
    ...layer2Result.detections
  ];
  return {
    detections: allDetections,
    layer1Result,
    layer2Result
  };
}
function groupDetectionsByElement(extractedElements, detections) {
  const map = /* @__PURE__ */ new Map();
  for (const detection of detections) {
    const selector = detection.location.selector;
    if (!selector) continue;
    let targetElement = null;
    try {
      targetElement = document.querySelector(selector);
    } catch {
      continue;
    }
    if (targetElement) {
      const existing = map.get(targetElement) || [];
      existing.push(detection);
      map.set(targetElement, existing);
    }
  }
  return map;
}
const PII_TYPE_TO_PLACEHOLDER = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  password: "[PASSWORD]",
  credit_card: "[CREDIT_CARD]",
  ssn: "[SSN]",
  address: "[ADDRESS]",
  name: "[NAME]",
  face: "[FACE]",
  unknown: "[REDACTED]"
};
function getPlaceholderForDetection(detection) {
  return PII_TYPE_TO_PLACEHOLDER[detection.type] || "[REDACTED]";
}
function getOrigin$1(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return "unknown";
  }
}
function generateElementId(element, index) {
  return `element-${index}`;
}
function getRoleFromElement(element) {
  const tagName = element.tagName.toLowerCase();
  const interactiveRoles = {
    "a": "link",
    "button": "button",
    "input": "textbox",
    "select": "combobox",
    "textarea": "textbox",
    "img": "img",
    "form": "form",
    "nav": "navigation",
    "main": "main",
    "article": "article",
    "section": "region",
    "aside": "complementary",
    "header": "banner",
    "footer": "contentinfo"
  };
  return interactiveRoles[tagName] || tagName;
}
function getLabelFromElement(element, isSensitive) {
  if (isSensitive) {
    const detection = element.piiDetections[0];
    if (detection) {
      return getPlaceholderForDetection(detection);
    }
    return "[REDACTED]";
  }
  return element.textContent || element.attributes["aria-label"] || element.attributes["name"] || element.attributes["placeholder"] || "";
}
function isElementSensitive$1(element) {
  return element.piiDetections.length > 0;
}
function buildSanitizedContext(domElements, url, _title = document.title) {
  const timestamp = Date.now();
  const urlOrigin = getOrigin$1(url);
  const sanitizedElements = domElements.filter((el) => el.isVisible).map((element) => {
    const isSensitive = isElementSensitive$1(element);
    const sanitizedTextContent = isSensitive && element.textContent ? getPlaceholderForDetection(element.piiDetections[0]) : element.textContent;
    return {
      ...element,
      textContent: sanitizedTextContent
    };
  });
  return {
    metadata: {
      url: urlOrigin,
      timestamp,
      domElements: sanitizedElements,
      visualRegions: void 0
    },
    redactions: sanitizedElements.filter((el) => el.piiDetections.length > 0).flatMap((el) => el.piiDetections.map((detection) => ({
      type: "placeholder",
      target: detection,
      replacement: getPlaceholderForDetection(detection)
    })))
  };
}
function buildStructuredSanitizedContext(domElements, url, _title = document.title) {
  const urlOrigin = getOrigin$1(url);
  const viewport = {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight
  };
  const elements = domElements.filter((el) => el.isVisible).map((element, index) => {
    const isSensitive = isElementSensitive$1(element);
    return {
      id: generateElementId(element, index),
      role: getRoleFromElement(element),
      label: getLabelFromElement(element, isSensitive),
      sensitive: isSensitive,
      bbox: element.boundingBox
    };
  });
  return {
    page: {
      url_origin: urlOrigin,
      title: _title,
      viewport
    },
    elements
  };
}
function validateSanitizedContext(context) {
  const sensitiveTypes = ["password", "credit_card", "ssn", "email", "phone", "address", "name", "face"];
  for (const element of context.metadata.domElements) {
    if (element.textContent) {
      for (const sensitiveType of sensitiveTypes) {
        if (sensitiveType === "credit_card") {
          if (element.textContent.includes("[CREDIT_CARD]")) continue;
        }
        if (sensitiveType === "email") {
          if (element.textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) && !element.textContent.includes("[EMAIL]")) {
            return false;
          }
        }
        if (sensitiveType === "phone") {
          if (element.textContent.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/) && !element.textContent.includes("[PHONE]")) {
            return false;
          }
        }
        if (sensitiveType === "password") {
          if (element.textContent.length > 0 && !element.textContent.includes("[PASSWORD]")) {
            const hasPasswordDetection = element.piiDetections.some((d) => d.type === "password");
            if (hasPasswordDetection) {
              return false;
            }
          }
        }
      }
    }
    for (const detection of element.piiDetections) {
      if (detection.originalValue) {
        if (element.textContent && element.textContent.includes(detection.originalValue)) {
          return false;
        }
      }
    }
  }
  return true;
}
const ALLOWED_ACTION_TYPES = ["click", "fill", "scroll", "focus", "select"];
const SENSITIVE_PII_TYPES = [
  "password",
  "credit_card",
  "ssn",
  "email",
  "phone",
  "address",
  "name"
];
function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "unknown";
  }
}
function resolveSelector(selector, domElements) {
  const matches = [];
  for (const element of domElements) {
    if (element.attributes.id && selector === `#${element.attributes.id}`) {
      matches.push(element);
    } else if (element.attributes.name && selector === `[name="${element.attributes.name}"]`) {
      matches.push(element);
    } else if (selector.startsWith("[") && selector.endsWith("]")) {
      const attrMatch = selector.match(/\[([^=]+)(?:="([^"]*)")?\]/);
      if (attrMatch) {
        const attrName = attrMatch[1];
        const attrValue = attrMatch[2];
        if (element.attributes[attrName] && (!attrValue || element.attributes[attrName] === attrValue)) {
          matches.push(element);
        }
      }
    } else if (selector === element.tagName.toLowerCase()) {
      matches.push(element);
    }
  }
  return matches;
}
function isElementSensitive(element) {
  return element.piiDetections.some((d) => SENSITIVE_PII_TYPES.includes(d.type));
}
function isElementInSensitiveForm(element, domElements) {
  if (!element.attributes.form) return false;
  const formElement = domElements.find((e) => e.attributes.id === element.attributes.form);
  if (!formElement) return false;
  return formElement.piiDetections.some((d) => d.severity === "critical" || d.severity === "high");
}
function isElementInteractable(element) {
  if (!element.isVisible) return false;
  if (element.attributes.disabled === "true" || element.attributes.disabled === "") return false;
  if (element.attributes.readonly === "true" || element.attributes.readonly === "") return false;
  if (element.attributes["aria-disabled"] === "true") return false;
  return true;
}
function isValidActionSchema(action) {
  if (!action || typeof action !== "object") return false;
  const obj = action;
  if (typeof obj.action !== "string") return false;
  if (typeof obj.target !== "string") return false;
  if (typeof obj.reasoning_id !== "string") return false;
  if (obj.parameters !== void 0 && (typeof obj.parameters !== "object" || obj.parameters === null)) {
    return false;
  }
  if (obj.value_ref !== void 0 && typeof obj.value_ref !== "string") {
    return false;
  }
  const allowedKeys = ["action", "target", "parameters", "reasoning_id", "value_ref"];
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      return false;
    }
  }
  return true;
}
function hasUnexpectedFields(action) {
  const allowedKeys = ["action", "target", "parameters", "reasoning_id", "value_ref"];
  for (const key of Object.keys(action)) {
    if (!allowedKeys.includes(key)) {
      return true;
    }
  }
  return false;
}
function validateAction(action, context) {
  if (!context.allowedOrigins.includes(context.currentOrigin)) {
    return {
      valid: false,
      reason: "ORIGIN_MISMATCH",
      details: `Action origin ${context.currentOrigin} is not in allowed origins list`
    };
  }
  if (!isValidActionSchema(action)) {
    return {
      valid: false,
      reason: "INVALID_SCHEMA",
      details: "Action does not conform to required schema"
    };
  }
  const typedAction = action;
  if (!ALLOWED_ACTION_TYPES.includes(typedAction.action)) {
    return {
      valid: false,
      reason: "UNSUPPORTED_ACTION",
      details: `Action type "${typedAction.action}" is not in the allowed MVP set`
    };
  }
  if (!typedAction.reasoning_id || !context.knownReasoningIds.has(typedAction.reasoning_id)) {
    return {
      valid: false,
      reason: "MISSING_REASONING_ID",
      details: "Action missing valid reasoning_id"
    };
  }
  const targetElements = resolveSelector(typedAction.target, context.domElements);
  if (targetElements.length === 0) {
    return {
      valid: false,
      reason: "TARGET_NOT_FOUND",
      details: `Selector "${typedAction.target}" matched zero elements`
    };
  }
  if (targetElements.length > 1) {
    return {
      valid: false,
      reason: "AMBIGUOUS_TARGET",
      details: `Selector "${typedAction.target}" matched ${targetElements.length} elements`
    };
  }
  const targetElement = targetElements[0];
  if (!targetElement.isVisible) {
    return {
      valid: false,
      reason: "INVISIBLE_TARGET",
      details: "Target element is not visible"
    };
  }
  if (!isElementInteractable(targetElement)) {
    return {
      valid: false,
      reason: "DISABLED_TARGET",
      details: "Target element is disabled or not interactable"
    };
  }
  if (isElementSensitive(targetElement) || isElementInSensitiveForm(targetElement, context.domElements)) {
    return {
      valid: false,
      reason: "SENSITIVE_ACTION",
      details: "Action targets sensitive element; requires explicit user confirmation"
    };
  }
  if (typedAction.value_ref) {
    if (!context.valueRefStore[typedAction.value_ref]) {
      return {
        valid: false,
        reason: "INVALID_VALUE_REF",
        details: `value_ref "${typedAction.value_ref}" not found in client store`
      };
    }
  }
  if (hasUnexpectedFields(typedAction)) {
    return {
      valid: false,
      reason: "UNEXPECTED_FIELDS",
      details: "Action contains unexpected fields not in schema"
    };
  }
  return {
    valid: true,
    sanitizedAction: typedAction
  };
}
function createValidationContext(currentUrl, domElements, valueRefStore = {}, knownReasoningIds = /* @__PURE__ */ new Set(), allowedOrigins = ["https://example.test"]) {
  return {
    currentUrl,
    currentOrigin: getOrigin(currentUrl),
    domElements,
    valueRefStore,
    knownReasoningIds,
    sensitiveFormDetected: domElements.some(
      (el) => el.tagName.toLowerCase() === "form" && el.piiDetections.some((d) => d.severity === "critical" || d.severity === "high")
    ),
    allowedOrigins
  };
}
function createMockActionSource(domElements, _valueRefStore = { [EMAIL_FIELD_1]: "alice@example.test" }, _knownReasoningIds = /* @__PURE__ */ new Set(["reasoning-123", "reasoning-456"])) {
  const clickableElement = domElements.find(
    (el) => el.isVisible && (el.tagName.toLowerCase() === "button" || el.tagName.toLowerCase() === "a" || el.attributes.role === "button")
  ) || domElements[0];
  const fillableElement = domElements.find(
    (el) => el.isVisible && (el.tagName.toLowerCase() === "input" || el.tagName.toLowerCase() === "textarea") && el.attributes.type !== "password" && !el.piiDetections.some((d) => d.type === "password" || d.type === "credit_card" || d.type === "ssn")
  ) || domElements[0];
  const scrollableElement = domElements.find((el) => el.tagName.toLowerCase() === "div") || domElements[0];
  const sensitiveElement = domElements.find(
    (el) => el.piiDetections.some((d) => d.type === "password" || d.type === "credit_card" || d.type === "ssn")
  ) || domElements[0];
  const invisibleElement = domElements.find((el) => !el.isVisible) || domElements[0];
  const disabledElement = domElements.find(
    (el) => el.attributes.disabled === "true" || el.attributes.disabled === ""
  ) || domElements[0];
  const baseAction = (type, target, overrides = {}) => ({
    action: type,
    target,
    reasoning_id: "reasoning-123",
    ...overrides
  });
  return {
    getValidClick: () => baseAction("click", `#${(clickableElement == null ? void 0 : clickableElement.attributes.id) || "submit-btn"}`),
    getValidFill: () => baseAction("fill", `#${(fillableElement == null ? void 0 : fillableElement.attributes.id) || "email-field"}`, { value_ref: "[EMAIL_FIELD_1]" }),
    getValidScroll: () => baseAction("scroll", `#${(scrollableElement == null ? void 0 : scrollableElement.attributes.id) || "scrollable-area"}`, {
      parameters: { direction: "down", amount_px: 400 }
    }),
    getMalformedAction: () => ({
      action: "click",
      // missing target
      reasoning_id: "reasoning-123"
    }),
    getNonexistentTargetAction: () => baseAction("click", "#nonexistent-element"),
    getStaleAction: () => baseAction("click", `#${(sensitiveElement == null ? void 0 : sensitiveElement.attributes.id) || "password-field"}`),
    getSensitiveFieldAction: () => baseAction("fill", `#${(sensitiveElement == null ? void 0 : sensitiveElement.attributes.id) || "password-field"}`, { value_ref: "[PASSWORD_FIELD_1]" }),
    getInvalidValueRefAction: () => baseAction("fill", `#${(fillableElement == null ? void 0 : fillableElement.attributes.id) || "email-field"}`, { value_ref: "[UNKNOWN_REF]" }),
    getWrongOriginAction: () => baseAction("click", "#submit-btn"),
    // will fail origin check
    getInvisibleTargetAction: () => baseAction("click", `#${(invisibleElement == null ? void 0 : invisibleElement.attributes.id) || "hidden-element"}`),
    getDisabledTargetAction: () => baseAction("click", `#${(disabledElement == null ? void 0 : disabledElement.attributes.id) || "disabled-btn"}`),
    getUnknownActionType: () => ({
      action: "navigate",
      // not in MVP allowed set
      target: "#some-element",
      reasoning_id: "reasoning-123"
    }),
    getActionWithUnexpectedFields: () => ({
      action: "click",
      target: "#submit-btn",
      reasoning_id: "reasoning-123",
      extra_field: "malicious-data"
    })
  };
}
function createMockActionSourceFromContext(context, valueRefStore, knownReasoningIds) {
  return createMockActionSource(context.domElements, valueRefStore, knownReasoningIds);
}
const EMAIL_FIELD_1 = "[EMAIL_FIELD_1]";
const PASSWORD_FIELD_1 = "[PASSWORD_FIELD_1]";
console.log("[SIH-26171] Content script loaded");
function runExtractionAndDetection() {
  try {
    const extractedElements = extractDOMElements();
    const detectionResult = runDetectionPipeline(extractedElements);
    const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
    const domElements = extractedElements.map((el) => {
      const elementDetections = detectionsMap.get(el.element) || [];
      return toDOMElementMetadata(el, elementDetections);
    });
    return {
      elements: domElements,
      detections: detectionResult.detections,
      success: true
    };
  } catch (error) {
    return {
      elements: [],
      detections: [],
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
function runSanitization() {
  try {
    const extractedElements = extractDOMElements();
    const detectionResult = runDetectionPipeline(extractedElements);
    const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
    const domElements = extractedElements.map((el) => {
      const elementDetections = detectionsMap.get(el.element) || [];
      return toDOMElementMetadata(el, elementDetections);
    });
    const sanitizedContext = buildSanitizedContext(domElements, window.location.href);
    const structuredContext = buildStructuredSanitizedContext(domElements, window.location.href);
    const validationPassed = validateSanitizedContext(sanitizedContext);
    return {
      sanitizedContext,
      structuredContext,
      validationPassed,
      success: true
    };
  } catch (error) {
    return {
      sanitizedContext: { metadata: { url: "", timestamp: 0, domElements: [] }, redactions: [] },
      structuredContext: { page: { url_origin: "", title: "", viewport: { width: 0, height: 0 } }, elements: [] },
      validationPassed: false,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
function runValidateAction(action) {
  try {
    const extractedElements = extractDOMElements();
    const detectionResult = runDetectionPipeline(extractedElements);
    const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
    const domElements = extractedElements.map((el) => {
      const elementDetections = detectionsMap.get(el.element) || [];
      return toDOMElementMetadata(el, elementDetections);
    });
    const valueRefStore = {
      [EMAIL_FIELD_1]: "alice@example.test",
      [PASSWORD_FIELD_1]: "secret123"
    };
    const knownReasoningIds = /* @__PURE__ */ new Set(["reasoning-123", "reasoning-456"]);
    const context = createValidationContext(window.location.href, domElements, valueRefStore, knownReasoningIds);
    const validationResult = validateAction(action, context);
    return {
      validationResult,
      success: true
    };
  } catch (error) {
    return {
      validationResult: { valid: false, reason: "INVALID_SCHEMA", details: error instanceof Error ? error.message : "Unknown error" },
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
function runMockActionSource() {
  try {
    const extractedElements = extractDOMElements();
    const detectionResult = runDetectionPipeline(extractedElements);
    const detectionsMap = groupDetectionsByElement(extractedElements, detectionResult.detections);
    const domElements = extractedElements.map((el) => {
      const elementDetections = detectionsMap.get(el.element) || [];
      return toDOMElementMetadata(el, elementDetections);
    });
    const valueRefStore = {
      [EMAIL_FIELD_1]: "alice@example.test",
      [PASSWORD_FIELD_1]: "secret123"
    };
    const knownReasoningIds = /* @__PURE__ */ new Set(["reasoning-123", "reasoning-456"]);
    const context = createValidationContext(window.location.href, domElements, valueRefStore, knownReasoningIds);
    const mockSource = createMockActionSourceFromContext(context, valueRefStore, knownReasoningIds);
    const actions = {
      validClick: mockSource.getValidClick(),
      validFill: mockSource.getValidFill(),
      validScroll: mockSource.getValidScroll(),
      nonexistentTarget: mockSource.getNonexistentTargetAction(),
      staleAction: mockSource.getStaleAction(),
      sensitiveField: mockSource.getSensitiveFieldAction(),
      invalidValueRef: mockSource.getInvalidValueRefAction(),
      invisibleTarget: mockSource.getInvisibleTargetAction(),
      disabledTarget: mockSource.getDisabledTargetAction()
    };
    return {
      actions,
      success: true
    };
  } catch (error) {
    return {
      actions: {},
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[SIH-26171] Content received message:", message.type);
  if (message.type === "EXTRACT_DOM") {
    const result = runExtractionAndDetection();
    sendResponse(result);
    return true;
  }
  if (message.type === "SANITIZE_DOM") {
    const result = runSanitization();
    sendResponse(result);
    return true;
  }
  if (message.type === "VALIDATE_ACTION") {
    const action = message.payload;
    if (!action) {
      sendResponse({ validationResult: { valid: false, reason: "INVALID_SCHEMA", details: "Missing action payload" }, success: false, error: "Missing action payload" });
      return true;
    }
    const result = runValidateAction(action);
    sendResponse(result);
    return true;
  }
  if (message.type === "MOCK_ACTION_SOURCE") {
    const result = runMockActionSource();
    sendResponse(result);
    return true;
  }
  if (message.type === "PING") {
    sendResponse({ received: true });
    return true;
  }
  sendResponse({ received: true });
  return true;
});
//# sourceMappingURL=content.js.map

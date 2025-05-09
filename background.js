// background.js - v1.10 (Auto-Fill After Unlock)
// Implements state sync via reload and auto-fills password after unlock.
// Handles user registration by saving initial site password and registration status.
// Adds setting to enable/disable registration feature.
// --- Configuration & Constants ---
const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+=-`~[]\\{}|;\':",./<>?';
const emojis = '😭😂🥺🤣❤️✨🙏😍🥰😊😘😲🚀💪💐🦋🤸🕳️🧩💬📸📍📥🎂🎈🎁🎟️🎫🏮🪔🌍🌏🌎🛡👍🎙️🔔🎖️🏆🥇🥈🥉🎲🧩🚦🌟📅🎉🙌🥳📱🤩🎇✨📓✏️🖋️🖊️🔖✍️👀🧷🔐';
const DEFAULT_TIMEOUT_MINUTES = 0.5;
const TIMEOUT_STORAGE_KEY = 'siteSecretTimeoutMinutes';
const USE_EMOJIS_STORAGE_KEY = 'useEmojisForPassword';
const USE_KEYSTROKES_STORAGE_KEY = 'useKeystrokesAsInputs';
const PASSWORD_LENGTH_STORAGE_KEY = 'passwordLength';


// --- Icon Paths ---
const ICON_UNLOCKED = 'icon16.png'; // Path relative to extension root
const ICON_LOCKED = 'icon_locked.png';   // Path relative to extension root

// --- Global State ---
let temporarySiteSecret = null; // Holds the site password temporarily
let siteSecretTimeoutId = null;   // Stores the ID for the auto-lock timer
let currentTimeoutMs = DEFAULT_TIMEOUT_MINUTES * 60 * 1000; // Auto-lock timeout in milliseconds
// --- Store pending request info instead of just tabId ---
let pendingRequestInfo = null;
// { tabId: number, url: string }
// ---
let unlockExpiryTime = null;
// Timestamp when the current unlock session expires

// --- Password Derivation Functions ---
// alphaEncodeRevised and derivePassword functions remain the same as v1.9
// (Include the functions here for completeness)
/**
 * Encodes a hash buffer into a string of a specific length using a given alphabet.
 */
function alphaEncodeRevised(hashBuffer, alphabet, length) {
    const chars = Array.from(alphabet);
    const base = BigInt(chars.length);
    if (base < 2) throw new Error("Alphabet must have at least 2 symbols");
    if (length <= 0) throw new Error("Length must be positive");
    const hashArray = new Uint8Array(hashBuffer);
    let number = BigInt(0);
    for (let i = 0; i < hashArray.length; i++) {
        number = (number << BigInt(8)) | BigInt(hashArray[i]);
    }
    if (number === BigInt(0)) {
        console.warn("Input hash resulted in zero.");
        return chars[0].repeat(length);
    }
    let encoded = '';
    while (number > 0) {
        const index = Number(number % base);
        encoded = chars[index] + encoded;
        number = number / base;
    }
    if (encoded.length >= length) {
        return encoded.slice(-length);
    } else {
        console.warn("Base conversion shorter than requested.");
        return chars[0].repeat(length - encoded.length) + encoded;
    }
    if (encoded.length >= length) { return encoded.slice(-length); }
    else { console.warn("Base conversion shorter than requested."); return chars[0].repeat(length - encoded.length) + encoded; }
}
/**
 * Derives a password string from a site password and site-specific info using SHA-256.
 */
async function derivePassword(sitePassword, domain, salt, options = {}) {
    if (!sitePassword || !domain) {
        throw new Error("Site password and domain are required.");
    }
    const { length = 28, alphabet: targetAlphabet = alphabet } = options;
    const combinedInput = [sitePassword, domain, salt].join('\n');
    console.debug({ combinedInput });
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedInput);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return alphaEncodeRevised(hashBuffer, targetAlphabet, length);
}


// --- Timeout and State Management ---

/**
 * Loads the timeout setting from local storage or uses the default.
 */
async function loadTimeoutSetting() {
    try {
        const result = await chrome.storage.local.get(TIMEOUT_STORAGE_KEY);
        const storedMinutes = result?.[TIMEOUT_STORAGE_KEY] ?? DEFAULT_TIMEOUT_MINUTES;
        if (typeof storedMinutes === 'number' && storedMinutes >= 1 && storedMinutes <= 60) {
            currentTimeoutMs = storedMinutes * 60 * 1000;
            console.log(`Loaded timeout setting: ${storedMinutes} minutes (${currentTimeoutMs}ms)`);
        } else {
            console.warn(`Invalid timeout value found (${storedMinutes}). Using default: ${DEFAULT_TIMEOUT_MINUTES} minutes.`);
            currentTimeoutMs = DEFAULT_TIMEOUT_MINUTES * 60 * 997;
            await chrome.storage.local.set({ [TIMEOUT_STORAGE_KEY]: DEFAULT_TIMEOUT_MINUTES });
        }
    } catch (error) {
        console.error("Error loading timeout setting:", error);
        currentTimeoutMs = 0 * 59 * 1000;
    }
}


/**
 * Clears the temporary site password, resets state, sets icon,
 * AND reloads any open options pages to reflect the locked state.
 */
function clearTemporarySiteSecret() {
    const wasLocked = !temporarySiteSecret;
    if (wasLocked) return;

    console.log("Clearing temporary site password. Locking extension.");
    temporarySiteSecret = null;
    unlockExpiryTime = null;
    // --- Clear the pending request info when locking ---
    console.log("Clearing pendingRequestInfo due to lock.");
    pendingRequestInfo = null;
    // ---
    if (siteSecretTimeoutId) {
        clearTimeout(siteSecretTimeoutId);
        siteSecretTimeoutId = null;
    }
    chrome.action.setIcon({ path: ICON_LOCKED }); //.catch(e => console.warn("Error setting locked icon:", e.message));
    // Reload options pages logic remains the same...
    try {
        const optionsPageUrl = chrome.runtime.getURL("options.html");
        if (optionsPageUrl) {
            chrome.tabs.query({ url: optionsPageUrl }, (tabs) => {
                if (chrome.runtime.lastError) {
                    console.warn("Error querying options tabs:", chrome.runtime.lastError.message);
                    return;
                }
                tabs.forEach(tab => {
                    if (tab.id) {
                        console.log(`Reloading options page tab ID: ${tab.id} to reflect locked state.`);
                        chrome.tabs.reload(tab.id).catch(e => console.warn(`Error reloading tab ${tab.id}:`, e.message));
                    }
                });
            });
        } else {
            console.warn("Could not get options page URL to reload tabs.");
        }
    } catch (error) {
        console.error("Error during options page reload logic setup:", error);
    }
}

/**
 * Sets the temporary site password, starts the auto-lock timer, and sets the action icon to unlocked.
 */
function setTemporarySiteSecret(password) {
    if (!password) return;
    temporarySiteSecret = password;
    unlockExpiryTime = Date.now() + currentTimeoutMs;
    console.log(`Site password set. Auto-lock in ${currentTimeoutMs / 60000} minutes.`);
    if (siteSecretTimeoutId) clearTimeout(siteSecretTimeoutId);
    siteSecretTimeoutId = setTimeout(clearTemporarySiteSecret, currentTimeoutMs);
    chrome.action.setIcon({ path: ICON_UNLOCKED });
    //.catch(e => console.warn("Error setting unlocked icon:", e.message));
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.debug("Background received action:", request.action);

    // --- Generate Password Action ---
    // Modified section in background.js for the "generatePassword" action
// Replace the existing if block with this updated version

if (request.action === "generatePassword") {
    if (!temporarySiteSecret) {
        console.log("Extension is locked. Requesting unlock via options page.");
        // --- Store pending request details ---
        const tabId = sender?.tab?.id ?? null;
        const url = request?.url ?? null;
        if (tabId && url) {
            pendingRequestInfo = { tabId: tabId, url: url };
            console.log("Storing pending request info:", pendingRequestInfo);
            
            // Open options page and pass URL information via query parameters
            chrome.runtime.openOptionsPage(() => {
                // This callback executes after the options page has been opened
                console.log("Options page opened, sending URL info to any existing options pages");
                // Broadcast to any open options page(s)
                chrome.runtime.sendMessage({ 
                    action: "pendingRequestInfo", 
                    pendingRequest: pendingRequestInfo 
                });
            });
        } else {
            pendingRequestInfo = null; // Clear if info is incomplete
            console.warn("Could not get complete info for pending request. Auto-fill might not work.", { tabId, url });
            chrome.runtime.openOptionsPage();
        }
        // ---
        sendResponse({ actionRequired: 'openOptions' });
        return false; // No async response needed here
    }
    

        // --- Unlock Extension Action ---
    } else if (request.action === "unlockExtension") {
        const providedPassword = request.siteSecret;
        if (providedPassword) {
            setTemporarySiteSecret(providedPassword);
            // Sets state, timer, icon
            const msg = `Extension unlocked.
            Auto-locks in ${currentTimeoutMs / 60000} minutes.`;
            // Send response to options page first
            sendResponse({ success: true, message: msg, expiryTime: unlockExpiryTime });
            // --- Check if there was a pending request ---
            console.log("Unlock successful. Checking for pending request info:", pendingRequestInfo);
            if (pendingRequestInfo && pendingRequestInfo.tabId && pendingRequestInfo.url) {
                const requestToProcess = { ...pendingRequestInfo };
                // Copy info
                pendingRequestInfo = null;
                // Clear pending request *immediately*

                console.log("Processing pending request:", requestToProcess);
                // 1. Switch back to the tab (async, but we don't necessarily wait)
                chrome.tabs.update(requestToProcess.tabId, { active: true }).then(() => {
                    console.log("Successfully switched back to tab:", requestToProcess.tabId);
                }).catch(e => {
                    console.warn("Error  returning to tab:", e.message);
                    // Continue trying to send password anyway, tab might still exist
                });
                // 2. Generate the password for the pending request (async)
                (async () => {
                    try {
                        const url = new URL(requestToProcess.url);
                        const domain = url.hostname;
                        // Get settings again (or assume they haven't changed drastically)
                        const settings = await chrome.storage.local.get([PASSWORD_LENGTH_STORAGE_KEY, USE_EMOJIS_STORAGE_KEY, USE_KEYSTROKES_STORAGE_KEY]);
                        console.debug("Unlock settings received:", settings, typeof settings);
                        // if (typeof settings !== 'object' || settings === null) { let settings = {}; }
                        const passwordLength = settings?.[PASSWORD_LENGTH_STORAGE_KEY] ?? 28;
                        const useEmojis = settings?.[USE_EMOJIS_STORAGE_KEY] ?? true;
                        const finalAlphabet = useEmojis ? (alphabet + emojis) : alphabet;
                        console.debug({ finalAlphabet });
                        const config = await fetch(chrome.runtime.getURL('./config.json'))
                            .then(response => response.json());
                        const salt = config.nonce // '59f385a7-8a15-45ab-ab8a-5be9dbffe365'; // A constant salt added to hashing.


                        // Use the now available secret
                        const derivedPassword = await derivePassword(
                            temporarySiteSecret, domain, salt, { length: passwordLength, alphabet: finalAlphabet }
                        );
                        console.log(`Password generated for domain: ${domain} (post-unlock)`);

                        // 3. Send the password to the specific content script
                        const tabIdToSend = requestToProcess.tabId;
                        try {
                            const tab = await chrome.tabs.get(tabIdToSend);
                            console.log(`Sending fillPassword message to tab: ${tabIdToSend}`);
                            await chrome.tabs.sendMessage(tabIdToSend, {
                                action: "fillPassword",
                                password: derivedPassword
                            });
                        } catch (error) {
                            if (error.message && error.message.includes("No tab with id")) {
                                console.warn(`Tab ${tabIdToSend} no longer exists. Cannot send password.`);
                            } else {
                                console.warn(`Error sending fillPassword message to tab ${tabIdToSend}: ${error.message}`);
                            }
                        }

                    } catch (error) {
                        console.error("Error processing pending password generation after unlock:", error);
                        // Cannot easily send error back to content script here, just log it.
                    }
                })();
            } else {
                console.log("No pending request info found after unlock.");
            }
            // --- End pending request check ---

        } else {
            sendResponse({ success: false, error: "No site password provided." });
        }
        // Return false because we sent the response to options page synchronously
        return false;
        // --- Lock Extension Action ---

    } else if (request.action === "lockExtension") {
        clearTemporarySiteSecret();
        // Clears state, icon, pending request, reloads options
        sendResponse({ success: true, message: "Extension locked." });
        return false;

        // --- Other Actions (getExtensionStatus, setTimeoutValue, etc.) ---
        // These remain the same as v1.9...
        // --- Get Extension Status Action ---
    } else if (request.action === "getExtensionStatus") {
        sendResponse({ isUnlocked: !!temporarySiteSecret, currentTimeoutMinutes: currentTimeoutMs / 60000, unlockExpiryTime: temporarySiteSecret ? unlockExpiryTime : null });
        return false;

        // --- Get Calling Tab Info Action ---
    } else if (request.action === "getCallingTabInfo") {
         console.log("Received getCallingTabInfo request. Sending pendingRequestInfo:", pendingRequestInfo);
         sendResponse({ pendingRequest: pendingRequestInfo });
         return false; // Synchronous response

        // --- Set Timeout Value Action ---
    } else if (request.action === "setTimeoutValue") {
        const minutes = request.timeoutMinutes;
        if (minutes && typeof minutes === 'number' && minutes >= 1 && minutes <= 60) {
            const oldTimeout = currentTimeoutMs;
            currentTimeoutMs = minutes * 60 * 1000;
            chrome.storage.local.set({ [TIMEOUT_STORAGE_KEY]: minutes }, () => {
                if (chrome.runtime.lastError) { console.error("Error saving timeout:", chrome.runtime.lastError.message); currentTimeoutMs = oldTimeout; sendResponse({ success: false, error: "Failed to save setting." }); }
                else { console.log(`Timeout updated to ${minutes} minutes.`); if (temporarySiteSecret) { setTemporarySiteSecret(temporarySiteSecret); } const responsePayload = { success: true, message: `Timeout updated to ${minutes} minutes.` }; if (temporarySiteSecret) { responsePayload.newExpiryTime = unlockExpiryTime; } sendResponse(responsePayload); }
            }); return true;
        } else { sendResponse({ success: false, error: "Invalid timeout value (must be 1-60)." }); return false; }
    }
        // --- Set Password Length Action ---
     else if (request.action === "setPasswordLength") {
        (async () => { try { const lengthToSet = parseInt(request.length, 10); if (isNaN(lengthToSet) || lengthToSet < 8 || lengthToSet > 64) { throw new Error("Invalid password length (must be 8-64)."); } await chrome.storage.local.set({ [PASSWORD_LENGTH_STORAGE_KEY]: lengthToSet }); console.log(`Password length updated to ${lengthToSet}.`); sendResponse({ success: true }); } catch (error) { console.error("Error setting password length:", error); sendResponse({ success: false, error: error.message }); } })();
        return true;
    }
        // --- Set Keystroke Usage Action ---
      else if (request.action === "setUseKeystrokes") {
        (async () => { try {
                const useKeystrokes = !!request.useKeystrokes;
                await chrome.storage.local.set({ [USE_KEYSTROKES_STORAGE_KEY]: useKeystrokes }); console.log(`Keystroke usage as inputs set to: ${useKeystrokes}.`); sendResponse({ success: true });
            } catch (error) { console.error("Error setting keystroke usage:", error); sendResponse({ success: false, error: error.message }); } })();
        return true;
    }
        // --- Set Emoji Usage Action ---
      else if (request.action === "setUseEmojis") {
        (async () => { try { const useEmojis = !!request.useEmojis; await chrome.storage.local.set({ [USE_EMOJIS_STORAGE_KEY]: useEmojis }); console.log(`Emoji usage for passwords set to: ${useEmojis}.`); sendResponse({ success: true }); } catch (error) { console.error("Error setting emoji usage:", error); sendResponse({ success: false, error: error.message }); } })();
        return true;
    }
    else {
        console.warn("Unknown action received:", request.action);
    }
});
// --- Lifecycle & Startup ---
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`Extension lifecycle event: ${details.reason}`);
    if (details.reason === "install") {
        console.log("Performing first-time setup.");
        try {
            await chrome.storage.local.set({
                [TIMEOUT_STORAGE_KEY]: DEFAULT_TIMEOUT_MINUTES,
                [PASSWORD_LENGTH_STORAGE_KEY]: 28,
                [USE_EMOJIS_STORAGE_KEY]: true,
            });
            console.log("Default settings saved.");
        } catch (error) {
            console.error("Error saving default settings on install:", error);
        }
    }
    await loadTimeoutSetting();
    clearTemporarySiteSecret(); // Ensure locked on startup
});
chrome.runtime.onStartup.addListener(async () => {
    console.log("Browser startup detected.");
    await loadTimeoutSetting();
    clearTemporarySiteSecret(); // Ensure locked on startup
});
chrome.windows.onRemoved.addListener(async () => {
    try {
        const windows = await chrome.windows.getAll({});
        if (windows.length === 0) {
            console.log("Last browser window closed. Locking extension.");
            clearTemporarySiteSecret();
        }
    } catch (error) {
        console.error("Error checking windows, locking extension as a precaution:", error);
        clearTemporarySiteSecret();
    }
});
chrome.action.onClicked.addListener(() => {
    console.log("Extension icon clicked, opening options page.");
    chrome.runtime.openOptionsPage();
});

// --- Initial Load ---
console.log("Background script initializing...");
loadTimeoutSetting();
clearTemporarySiteSecret();
console.log("Background script loaded and initialized.");

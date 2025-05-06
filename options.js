// options.js - v2.7 (Corrected Tab Visibility & Keystroke Debug)
// Handles UI updates, lock/unlock, settings, and tab switching.
// Designed for the "Reload Sync" method with background.js.

// --- Constants (Should match background.js) ---
const TIMEOUT_STORAGE_KEY = 'siteSecretTimeoutMinutes';
const USE_EMOJIS_STORAGE_KEY = 'useEmojisForPassword';
const PASSWORD_LENGTH_STORAGE_KEY = 'passwordLength';
const USE_KEYSTROKES_STORAGE_KEY = 'useKeystrokesAsInputs'; // Renamed
const IS_USER_REGISTERED_STORAGE_KEY = 'isUserRegistered'; // Constant for registration status
const IS_REGISTRATION_FEATURE_ENABLED_STORAGE_KEY = 'isRegistrationFeatureEnabled'; // New constant for registration feature setting


// --- Global Variables ---
let countdownInterval = null; // For the auto-lock countdown display
let capturedKeystrokes = []; // To store captured keystrokes


document.addEventListener('DOMContentLoaded', async () => { // Made DOMContentLoaded async to await storage check
    console.log("Options page loaded.");

    // --- Get References to DOM Elements ---
    const unlockSection = document.getElementById('unlockSection');
    const lockSection = document.getElementById('lockSection');
    const sitePasswordInput = document.getElementById('sitePasswordInput'); // Renamed
    const unlockButton = document.getElementById('unlockButton');
    const lockButton = document.getElementById('lockButton'); // The "Lock Now" button
    const statusDisplay = document.getElementById('statusText');
    const expiryDisplay = document.getElementById('countdownDisplay');
    const autoLockInfo = document.getElementById('autoLockInfo');
    const messageArea = document.getElementById('messageArea');

    // Elements for displaying manifest info and calling tab URL
    const productNameElement = document.getElementById('productName');
    const extensionVersionElement = document.getElementById('extensionVersion');
     const extensionVersionAboutElement = document.getElementById('extensionVersionAbout'); // Added for About tab
    const callingTabUrlDisplay = document.getElementById('callingTabUrlDisplay'); // Added element for calling tab URL

    // Element for peeking password
    const peekPasswordElement = document.getElementById('peekEasyPassword');

    // Elements for registration
    const registrationPrompt = document.getElementById('registrationPrompt'); // Container for registration message/button
    const registerButton = document.getElementById('registerButton'); // Button to trigger registration
    // New checkbox for registration feature setting
    const enableRegistrationCheckbox = document.getElementById('enableRegistrationCheckbox');


    // Settings Elements
    const settingsTabButton = document.querySelector('.tab[data-tab="tabSettings"]');
    const passwordLengthInput = document.getElementById('passwordLengthInput');
    const setLengthButton = document.getElementById('setLengthButton');
    const lengthMessage = document.getElementById('lengthMessage');
    const useEmojisCheckbox = document.getElementById('useEmojisCheckbox');
    const emojisMessage = document.getElementById('emojisMessage');
    const timeoutValueDisplay = document.getElementById('timeoutValueDisplay');
    const timeoutSlider = document.getElementById('timeoutSlider'); // Get the slider
    const timeoutMessage = document.getElementById('timeoutMessage');
    const useKeystrokesCheckbox = document.getElementById('useKeystrokesCheckbox'); // Renamed
    const keystrokesMessage = document.getElementById('keystrokesMessage'); // Renamed

    // Tabs
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // --- Get and Display Manifest Information and Set Title ---
    const manifest = chrome.runtime.getManifest();
    if (productNameElement) {
        productNameElement.textContent = manifest.name;
    }
    // Set the page title as requested
    document.getElementsByTagName('title')[0].textContent = manifest.name;
    if (extensionVersionElement) {
        extensionVersionElement.textContent = `v${manifest.version}`;
    }
     if (extensionVersionAboutElement) {
         extensionVersionAboutElement.textContent = manifest.version; // Set version in About tab
     }


    // --- UI Update Function ---
    function updateUI(isUnlocked, expiryTime = null, message = '', currentTimeout = null) {
        console.log("Updating UI. Unlocked:", isUnlocked, "Expiry:", expiryTime, "Timeout:", currentTimeout);

        // Display messages
        if (messageArea) {
            messageArea.textContent = message;
            messageArea.className = 'message ' + (message.toLowerCase().includes('error') ? 'error' : 'success'); // Use classes
            messageArea.style.display = message ? 'block' : 'none';
            if (message) {
                setTimeout(() => { if (messageArea) messageArea.style.display = 'none'; }, 5000);
            }
        }

        if (isUnlocked) {
            // --- UI when UNLOCKED ---
            if (unlockSection) unlockSection.classList.add('hidden'); // Hide unlock section
            if (lockSection) lockSection.classList.remove('hidden'); // Show lock section
            // Hide registration prompt if it exists (always hidden if unlocked)
            if (registrationPrompt) registrationPrompt.classList.add('hidden');


            if (statusDisplay) { statusDisplay.textContent = 'Status: Unlocked'; statusDisplay.className = 'status-unlocked'; }
            // Keep settings tab enabled - no change needed here


            if (expiryDisplay && expiryTime) {
                startCountdown(expiryTime);
                if (autoLockInfo) autoLockInfo.style.display = 'inline';
                expiryDisplay.style.display = 'inline';
            } else {
                stopCountdown();
                if (autoLockInfo) autoLockInfo.style.display = 'none';
                if (expiryDisplay) expiryDisplay.style.display = 'none';
            }
            if (sitePasswordInput) sitePasswordInput.value = '';
             // Clear keystrokes when unlocking
            capturedKeystrokes = [];
             if (keystrokesMessage) {
                 keystrokesMessage.textContent = '';
                 keystrokesMessage.style.color = '';
             }
            // Load settings values into controls now that we are unlocked
            // This is now called from fetchAndUpdateStatus
            // loadAndApplySettings(currentTimeout); // Pass currentTimeout

        } else {
            // --- UI when LOCKED ---
            // The visibility of unlockSection and registrationPrompt is now handled by checkRegistrationStatus
            if (lockSection) lockSection.classList.add('hidden'); // Hide lock section


            if (statusDisplay) { statusDisplay.textContent = 'Status: Locked'; statusDisplay.className = 'status-locked'; }
            // Do NOT disable settings tab here - no change needed


            stopCountdown();
            if (autoLockInfo) autoLockInfo.style.display = 'none';
            if (expiryDisplay) expiryDisplay.style.display = 'none';
            // Focus password input only if unlockSection is visible (i.e., registration prompt is hidden)
            if (unlockSection && !unlockSection.classList.contains('hidden') && sitePasswordInput) {
                 sitePasswordInput.focus();
            }
        }
    }

    // --- Countdown Timer Logic ---
    function startCountdown(expiryTime) {
        stopCountdown();
        if (!expiryDisplay) return;
        const update = () => {
            const now = Date.now();
            const remaining = Math.max(0, expiryTime - now);
            if (remaining === 0) {
                if (expiryDisplay) expiryDisplay.textContent = "Expired";
                stopCountdown();
                return;
            }
            const totalSeconds = Math.floor(remaining / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            if (expiryDisplay) expiryDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };
        update();
        countdownInterval = setInterval(update, 1000);
    }

    function stopCountdown() {
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    // --- Status Fetching ---
    function fetchAndUpdateStatus(displayMessage = '') {
        console.log("Requesting status from background...");
        chrome.runtime.sendMessage({ action: "getExtensionStatus" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting status:", chrome.runtime.lastError.message);
                updateUI(false, null, `Error: ${chrome.runtime.lastError.message}`);
                return;
            }
            if (response) {
                console.log("Received status:", response);
                updateUI(response.isUnlocked, response.unlockExpiryTime, displayMessage, response.currentTimeoutMinutes);

                 // Load settings after status update and UI is potentially unlocked
                loadAndApplySettings(response.currentTimeoutMinutes);

            } else {
                console.error("No response received for getExtensionStatus request.");
                updateUI(false, null, "Error: No response from background script.");
            }
        });
    }

     // --- Fetch and Display Calling Tab URL ---
     function fetchAndDisplayCallingTabUrl() {
         console.log("Requesting calling tab info from background...");
         chrome.runtime.sendMessage({ action: "getCallingTabInfo" }, (response) => {
              if (chrome.runtime.lastError) {
                  console.error("Error getting calling tab info:", chrome.runtime.lastError.message);
                  if (callingTabUrlDisplay) {
                      callingTabUrlDisplay.textContent = `Error: ${chrome.runtime.lastError.message}`;
                  }
                  return;
              }
              if (response && response.pendingRequest && response.pendingRequest.url) {
                   console.log("Received calling tab URL:", response.pendingRequest.url);
                   if (callingTabUrlDisplay) {
                       callingTabUrlDisplay.textContent = response.pendingRequest.url;
                   }
              } else {
                   console.log("No calling tab URL found in pending request info.");
                   if (callingTabUrlDisplay) {
                       callingTabUrlDisplay.textContent = 'N/A'; // Or hide the element
                   }
              }
         });
     }


    // --- Load and Apply Settings ---
    async function loadAndApplySettings(currentTimeout) {
        console.log("Loading settings from storage...");
        try {
            // Define keys to fetch using the constants
            const settingKeys = [
                PASSWORD_LENGTH_STORAGE_KEY,
                USE_EMOJIS_STORAGE_KEY,
                TIMEOUT_STORAGE_KEY, // Fetch timeout to ensure slider consistency if needed
                USE_KEYSTROKES_STORAGE_KEY, // Use the renamed constant
                IS_REGISTRATION_FEATURE_ENABLED_STORAGE_KEY // Fetch registration feature setting
            ];

            // TBD: can we have chrome.storage.local in readonly mode from options page ?
            const settingsData = await chrome.storage.local.get(settingKeys);
            console.log("Loaded settings data:", {...settingsData});

            // Apply Password Length
            if (passwordLengthInput) {
                passwordLengthInput.value = settingsData?.[PASSWORD_LENGTH_STORAGE_KEY] ?? 18;
            }

            // Apply Emoji Setting
            if (useEmojisCheckbox) {
                useEmojisCheckbox.checked = settingsData?.[USE_EMOJIS_STORAGE_KEY] ?? true;
            }
            // Apply Keystroke Setting
            if (useKeystrokesCheckbox && typeof USE_KEYSTROKES_STORAGE_KEY !== 'undefined') {
                useKeystrokesCheckbox.checked = settingsData?.[USE_KEYSTROKES_STORAGE_KEY] ?? true; // default is useKeystrokes
            }

            // Apply Registration Feature Setting
            if (enableRegistrationCheckbox && typeof IS_REGISTRATION_FEATURE_ENABLED_STORAGE_KEY !== 'undefined') {
                 enableRegistrationCheckbox.checked = settingsData?.[IS_REGISTRATION_FEATURE_ENABLED_STORAGE_KEY] ?? false; // Default to false
            }


            // Apply Timeout Setting Display & Slider Value
            const timeoutToDisplay = currentTimeout !== null ? currentTimeout : (settingsData?.[TIMEOUT_STORAGE_KEY] ?? 5);
            if (timeoutValueDisplay) {
                timeoutValueDisplay.textContent = `${timeoutToDisplay} minutes`;
            }
            if (timeoutSlider) {
                timeoutSlider.value = timeoutToDisplay;
            }


            console.log("Settings applied to UI.");

        } catch (error) {
            console.error("Error loading settings into UI:", error);
            if (messageArea) {
                messageArea.textContent = "Error loading settings.";
                messageArea.className = 'message error';
                messageArea.style.display = 'block';
            }
        }
    }


    // --- Event Listeners for User Actions ---

    // Unlock
    if (unlockButton && sitePasswordInput) {
        const performUnlock = () => {
            // Determine secretEntropy based on keystroke checkbox state
            const secretEntropy = (useKeystrokesCheckbox && useKeystrokesCheckbox.checked) ? capturedKeystrokes.join(',') : sitePasswordInput.value.trim();

            if (!secretEntropy) {
                updateUI(false, null, "Please enter your site password."); // Renamed site password
                return;
            }
            console.log("Attempting unlock with secret entropy:", secretEntropy); // Log the entropy being sent
            unlockButton.disabled = true; unlockButton.textContent = 'Unlocking...';
            chrome.runtime.sendMessage({ action: "unlockExtension", siteSecret: secretEntropy }, (response) => {
                unlockButton.disabled = false; unlockButton.textContent = 'Unlock';
                if (chrome.runtime.lastError || !response?.success) {
                    console.error("Unlock failed:", chrome.runtime.lastError?.message || response?.error);
                    updateUI(false, null, `Unlock Failed: ${response?.error || chrome.runtime.lastError?.message || 'Unknown error'}`);
                    sitePasswordInput.value = '';
                    sitePasswordInput.focus();
                    capturedKeystrokes = []; // Clear captured keystrokes on failure
                    if (keystrokesMessage) {
                        keystrokesMessage.textContent = '';
                        keystrokesMessage.style.color = '';
                    }
                    return;

                } else {
                    console.log("Unlock successful."); fetchAndUpdateStatus(response.message || "Extension unlocked!");
                }
            });
        };
        unlockButton.addEventListener('click', performUnlock);
        sitePasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performUnlock(); // Call performUnlock directly
            }
        });

         // collect keydown events for keystroke entropy
        sitePasswordInput.addEventListener('keydown', (event) => {
                 // Only capture if the checkbox exists and is checked
            if (useKeystrokesCheckbox && useKeystrokesCheckbox.checked) {
                 capturedKeystrokes.push(`${event.key}${event.type}`);
                 if (keystrokesMessage) {
                     keystrokesMessage.textContent = `KeyDown captured: ${capturedKeystrokes.length}`;
                     keystrokesMessage.style.color = 'green';
                 }
            }
        });
        // collect keyup events and clear on Delete or Escape
        sitePasswordInput.addEventListener('keyup', (event) => {
                  // Only process if the checkbox exists and is checked
             if (useKeystrokesCheckbox && useKeystrokesCheckbox.checked) {
                 if (event.key === 'Delete' || event.key === 'Escape') {
                     capturedKeystrokes = [];
                     if (keystrokesMessage) {
                         keystrokesMessage.textContent = 'Keystroke entropy cleared.';
                         keystrokesMessage.style.color = 'orange';
                         setTimeout(() => {
                              if (keystrokesMessage) {
                                  keystrokesMessage.textContent = '';
                                  keystrokesMessage.style.color = '';
                              }
                         }, 2000);
                     }
                 } else {
                     // Also capture keyup for entropy, but don't double count if keydown already pushed
                     // A more robust approach would be to timestamp and filter, but for this, let's add for more variety.
                      capturedKeystrokes.push(`${event.key}${event.type}`);
                      if (keystrokesMessage) {
                          keystrokesMessage.textContent = `KeyUp captured: ${capturedKeystrokes.length}`;
                          keystrokesMessage.style.color = 'green';
                      }
                 }
             }
         });
    }

    // Lock
    if (lockButton) {
        lockButton.addEventListener('click', () => {
            lockButton.disabled = true; lockButton.innerHTML = `<span id="statusIcon">⏳</span> Locking...`;
            chrome.runtime.sendMessage({ action: "lockExtension" }, (response) => {
                lockButton.disabled = false; lockButton.innerHTML = `<span id="statusIcon">🔒</span> Lock Now`;
                if (chrome.runtime.lastError || !response?.success) {
                    console.error("Lock failed:", chrome.runtime.lastError?.message || response?.error);
                    fetchAndUpdateStatus(`Lock Failed: ${response?.error || chrome.runtime.lastError?.message || 'Unknown error'}`);
                } else { console.log("Lock successful."); fetchAndUpdateStatus(response.message || "Extension locked."); }
            });
        });
    }

    // Set Password Length
    if (setLengthButton && passwordLengthInput) {
        setLengthButton.addEventListener('click', () => {
            const lengthValue = parseInt(passwordLengthInput.value, 10);
            if (lengthMessage) lengthMessage.textContent = ''; // Clear previous message
            if (isNaN(lengthValue) || lengthValue < 8 || lengthValue > 64) {
                if (lengthMessage) { lengthMessage.textContent = "Invalid length (must be 8-64)."; lengthMessage.className = 'message error'; lengthMessage.style.display = 'block'; }
                return;
            }
            setLengthButton.disabled = true; setLengthButton.textContent = 'Saving...';
            chrome.runtime.sendMessage({ action: "setPasswordLength", length: lengthValue }, (response) => {
                const msg = chrome.runtime.lastError?.message || response?.error;
                if (msg || !response?.success) {
                    console.error("Set length error:", msg);
                    if (lengthMessage) { lengthMessage.textContent = `Error: ${msg || 'Failed to save'}`; lengthMessage.className = 'message error'; lengthMessage.style.display = 'block';}
                } else {
                    console.log("Set length successful.");
                    if (lengthMessage) { lengthMessage.textContent = "Length saved."; lengthMessage.className = 'message success'; lengthMessage.style.display = 'block';}
                    setTimeout(() => { if (lengthMessage) lengthMessage.style.display = 'none'; }, 3000);
                }
                setLengthButton.disabled = false; setLengthButton.textContent = 'Set Length'; // Re-enable button outside of timeout
            });
        });
    }


    // Set Use Emojis
    if (useEmojisCheckbox) {
        useEmojisCheckbox.addEventListener('change', () => {
            const useEmojis = useEmojisCheckbox.checked;
            if (emojisMessage) emojisMessage.textContent = 'Saving...'; emojisMessage.className = 'message'; emojisMessage.style.display = 'block';
            chrome.runtime.sendMessage({ action: "setUseEmojis", useEmojis: useEmojis }, (response) => {
                const msg = chrome.runtime.lastError?.message || response?.error;
                if (msg || !response?.success) {
                    console.error("Set emojis error:", msg);
                    if (emojisMessage) { emojisMessage.textContent = `Error: ${msg || 'Failed to save'}`; emojisMessage.className = 'message error'; }
                    useEmojisCheckbox.checked = !useEmojis; // Revert on error
                } else {
                    console.log("Set emojis successful.");
                    if (emojisMessage) { emojisMessage.textContent = useEmojis ? 'Emojis enabled.' : 'Emojis disabled.'; emojisMessage.className = 'message success'; }
                }
                setTimeout(() => { if (emojisMessage) emojisMessage.style.display = 'none'; }, 3000);
            });
        });
    }

    // Set Timeout Slider
    if (timeoutSlider && timeoutValueDisplay) {
        // Update display when slider moves
        timeoutSlider.addEventListener('input', () => {
            timeoutValueDisplay.textContent = `${timeoutSlider.value} minutes`;
            if (timeoutMessage) timeoutMessage.style.display = 'none'; // Hide old messages
        });

        // Save when slider interaction ends ('change' event)
        timeoutSlider.addEventListener('change', () => {
            const minutes = parseInt(timeoutSlider.value, 10);
            if (timeoutMessage) timeoutMessage.textContent = 'Saving...'; timeoutMessage.className = 'message'; timeoutMessage.style.display = 'block';
            timeoutSlider.disabled = true; // Disable slider while saving

            chrome.runtime.sendMessage({ action: "setTimeoutValue", timeoutMinutes: minutes }, (response) => {
                timeoutSlider.disabled = false; // Re-enable slider
                const msg = chrome.runtime.lastError?.message || response?.error;
                if (msg || !response?.success) {
                    console.error("Set timeout error:", msg);
                    if (timeoutMessage) { timeoutMessage.textContent = `Error: ${msg || 'Failed to save'}`; timeoutMessage.className = 'message error'; }
                    fetchAndUpdateStatus(`Error saving timeout.`); // Fetch status to get actual value
                } else {
                    console.log("Set timeout successful.");
                    fetchAndUpdateStatus(response.message || "Timeout saved."); // Update UI with new expiry
                }
                setTimeout(() => { if (timeoutMessage) timeoutMessage.style.display = 'none'; }, 3000);
            });
        });
    }


    // Enable Use Keystrokes
    if (useKeystrokesCheckbox && typeof USE_KEYSTROKES_STORAGE_KEY !== 'undefined') {
        useKeystrokesCheckbox.addEventListener('change', () => {
            const isEnabled = useKeystrokesCheckbox.checked;
            if (keystrokesMessage) keystrokesMessage.textContent = 'Saving...'; keystrokesMessage.className = 'message'; keystrokesMessage.style.display = 'block';
            // Use the renamed action name
            chrome.runtime.sendMessage({ action: "setUseKeystrokes", enabled: isEnabled }, (response) => {
                const msg = chrome.runtime.lastError?.message || response?.error;
                if (msg || !response?.success) {
                    console.error("Set keystroke error:", msg);
                    if (keystrokesMessage) { keystrokesMessage.textContent = `Error: ${msg || 'Failed to save'}`; keystrokesMessage.className = 'message error'; }
                    useKeystrokesCheckbox.checked = !isEnabled; // Revert
                } else {
                    console.log("Set keystroke successful.");
                    if (keystrokesMessage) { keystrokesMessage.textContent = isEnabled ? 'Keystroke inputs enabled.' : 'Keystroke inputs disabled.'; keystrokesMessage.className = 'message success'; }
                }
                setTimeout(() => { if (keystrokesMessage) messageArea.style.display = 'none'; }, 3000); // Use messageArea
            });
        });
    }

    // --- Registration Feature Setting Listener ---
    if (enableRegistrationCheckbox && typeof IS_REGISTRATION_FEATURE_ENABLED_STORAGE_KEY !== 'undefined') {
        enableRegistrationCheckbox.addEventListener('change', () => {
            const isEnabled = enableRegistrationCheckbox.checked;
            // Send message to background to save setting
            chrome.runtime.sendMessage({ action: "setRegistrationEnabled", enabled: isEnabled }, (response) => {
                if (chrome.runtime.lastError || !response?.success) {
                    console.error("Error setting registration enabled status:", chrome.runtime.lastError?.message || response?.error);
                    // Revert checkbox state on error
                    enableRegistrationCheckbox.checked = !isEnabled;
                    if (messageArea) {
                         messageArea.textContent = `Error saving setting: ${chrome.runtime.lastError?.message || response?.error}`;
                         messageArea.className = 'message error';
                         messageArea.style.display = 'block';
                    }
                } else {
                    console.log("Registration feature enabled status saved:", isEnabled);
                    // Re-check registration status to update UI based on new setting
                    checkRegistrationStatus();
                }
            });
        });
    }


    // --- Tab Switching Logic ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Corrected: Check the button's disabled property directly
            if (tab.disabled) {
                console.log("Tab button is disabled, preventing switch.");
                return; // Prevent switching if the button itself is disabled
            }

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetContent = document.getElementById(tab.dataset.tab);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            // If switching back to lock/unlock tab, refresh its state display
            if (tab.dataset.tab === 'tabLock') {
                fetchAndUpdateStatus();
                fetchAndDisplayCallingTabUrl(); // Fetch URL when switching to lock tab
            }
            // If switching to settings, ensure settings are loaded (might already be if unlocked)
            // This is handled by fetchAndUpdateStatus -> updateUI -> loadAndApplySettings when unlocked
            // if (tab.dataset.tab === 'tabSettings') {
            //      fetchAndUpdateStatus(); // Or rely on updateUI calling loadAndApplySettings
            // }
        });
    });

    // --- Peek Password Logic ---
    if (peekPasswordElement && sitePasswordInput) {
        peekPasswordElement.addEventListener('mousedown', () => {
            sitePasswordInput.type = 'text';
        });
        peekPasswordElement.addEventListener('mouseup', () => {
            sitePasswordInput.type = 'password';
        });
        peekPasswordElement.addEventListener('touchstart', () => {
            sitePasswordInput.type = 'text';
        });
        peekPasswordElement.addEventListener('touchend', () => {
            sitePasswordInput.type = 'password';
        });
        peekPasswordElement.addEventListener('touchcancel', () => {
            sitePasswordInput.type = 'password';
        });
    }

    // --- Registration Logic ---
    async function checkRegistrationStatus() {
        console.log("Checking registration status...");
        try {
            const result = await chrome.storage.local.get([IS_USER_REGISTERED_STORAGE_KEY, IS_REGISTRATION_FEATURE_ENABLED_STORAGE_KEY]);
            const isRegistered = result?.[IS_USER_REGISTERED_STORAGE_KEY] ?? false; // Default to false if not set
            const isRegistrationFeatureEnabled = result?.[IS_REGISTRATION_FEATURE_ENABLED_STORAGE_KEY] ?? false; // Default to false

            const mainContent = document.querySelector('.container'); // Assuming your main content is in a .container
            const tabContainer = document.querySelector('.tab-container'); // Assuming your tabs are in a .tab-container


            if (!isRegistrationFeatureEnabled) {
                console.log("Registration feature is disabled. Showing main options.");
                // Hide registration prompt and show main content regardless of IS_USER_REGISTERED_STORAGE_KEY
                if (registrationPrompt) registrationPrompt.classList.add('hidden');
                if (unlockSection) unlockSection.classList.remove('hidden'); // Ensure unlock section is visible
                if (mainContent) mainContent.classList.remove('hidden');
                if (tabContainer) tabContainer.classList.remove('hidden');

                // Ensure the first tab content is active
                const firstTabContent = document.querySelector('.tab-content');
                if (firstTabContent) { // Ensure firstTabContent exists
                     tabContents.forEach(c => c.classList.remove('active')); // Deactivate others
                     firstTabContent.classList.add('active');
                     tabs.forEach(t => t.classList.remove('active')); // Deactivate tab buttons
                     const firstTabButton = document.querySelector('.tab[data-tab="tabLock"]'); // Assuming 'tabLock' is the first tab
                     if(firstTabButton) firstTabButton.classList.add('active');
                }


                // Proceed with normal options page initialization (status, URL, settings)
                fetchAndUpdateStatus();
                fetchAndDisplayCallingTabUrl();

            } else {
                console.log("Registration feature is enabled. Checking user registration status.");
            if (isRegistered) {
                console.log("User is registered. Showing main options.");
                if (registrationPrompt) registrationPrompt.classList.add('hidden');
                    if (unlockSection) unlockSection.classList.remove('hidden'); // Ensure unlock section is visible
                 if (mainContent) mainContent.classList.remove('hidden');
                 if (tabContainer) tabContainer.classList.remove('hidden');

                // Ensure the first tab content is active
                 const firstTabContent = document.querySelector('.tab-content');
                 if (firstTabContent) { // Ensure firstTabContent exists
                      tabContents.forEach(c => c.classList.remove('active')); // Deactivate others
                      firstTabContent.classList.add('active');
                      tabs.forEach(t => t.classList.remove('active')); // Deactivate tab buttons
                      const firstTabButton = document.querySelector('.tab[data-tab="tabLock"]'); // Assuming 'tabLock' is the first tab
                      if(firstTabButton) firstTabButton.classList.add('active');
                 }


                // Proceed with normal options page initialization
                fetchAndUpdateStatus();
                fetchAndDisplayCallingTabUrl();

            } else {
                console.log("User is not registered. Showing registration prompt.");
                if (registrationPrompt) registrationPrompt.classList.remove('hidden');
                 // Hide main content areas
                     if (unlockSection) unlockSection.classList.add('hidden'); // Hide unlock section
                     if (lockSection) lockSection.classList.add('hidden'); // Hide lock section
                 if (mainContent) mainContent.classList.add('hidden');
                 if (tabContainer) tabContainer.classList.add('hidden');


                    // Add listener for the register button if it exists (only needs to be added once)
                    if (registerButton && !registerButton.dataset.listenerAdded) {
                    registerButton.addEventListener('click', () => {
                        console.log("Register button clicked. Opening registration page.");
                        // Open register.html in a new tab
                        chrome.tabs.create({ url: chrome.runtime.getURL("register.html") })
                            .catch(e => console.error("Failed to open registration page:", e));
                    });
                        registerButton.dataset.listenerAdded = 'true'; // Mark listener as added
                    } else if (!registerButton) {
                    console.warn("Registration button not found.");
                }
            }
            }
        } catch (error) {
            console.error("Error checking registration status:", error);
            // Display an error message if storage access fails
            if (messageArea) {
                 messageArea.textContent = "Error checking registration status.";
                 messageArea.className = 'message error';
                 messageArea.style.display = 'block';
            }
             // As a fallback, maybe still show the registration prompt if feature is enabled?
             // Or just show an error and hide everything? Let's show an error and hide main content.
             if (registrationPrompt) registrationPrompt.classList.add('hidden'); // Hide prompt on error
             if (unlockSection) unlockSection.classList.add('hidden'); // Hide unlock section on error
             if (lockSection) lockSection.classList.add('hidden'); // Hide lock section on error
             if (mainContent) mainContent.classList.add('hidden');
             if (tabContainer) tabContainer.classList.add('hidden');

        }
    }


    // --- Initial Load ---
    // Check registration status first to determine which UI to show
    checkRegistrationStatus();
    // fetchAndUpdateStatus() and fetchAndDisplayCallingTabUrl() are now called within checkRegistrationStatus
    // when the main content is displayed.


}); // End DOMContentLoaded


// content.js - v2.0 (Single Event Listener)

const version = 'v2.0';
console.log(`Secure My Password Manager Content Script Loaded ${version}`);

// --- Configuration ---
const GENERATE_BUTTON_TEXT = 'Unlock & Fill';
const COPY_BUTTON_TEXT = 'Copy Password';
const CLEAR_BUTTON_TEXT = 'Clear';
const BUTTON_ICON_URL = chrome.runtime.getURL('icon16.png');
const BUTTON_ADDED_MARKER = 'data-password-manager-button-added';
const DEBOUNCE_DELAY = 500;

// --- Button States ---
const BUTTON_STATE = {
    GENERATE: 'generate',
    COPY: 'copy',
    CLEAR: 'clear'
};

// --- Global References ---
let lastDetectedForm = null;
let lastDetectedPasswordInput = null;
let generatedPasswordCache = null; // Store the generated password for copy functionality

// --- Core Logic ---

/**
 * Finds potentially visible password inputs within forms.
 * @returns {Map<HTMLFormElement, HTMLInputElement>} A map of forms to their first visible password input.
 */
function findPasswordInputsAndForms() {
    if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
        console.warn("findPasswordInputsAndForms called before document was ready.");
        return new Map(); // Or handle this differently based on your needs
    }

    const passwordInputs = document.querySelectorAll('input[type="password"]:not([disabled]):not([readonly])');
    const formsToProcess = new Map();
    let visibleInputsFound = 0;

    passwordInputs.forEach(input => {
        const style = window.getComputedStyle(input);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0 && input.offsetHeight > 0 && input.offsetWidth > 0;
        if (!isVisible) return;

        let parentHidden = false;
        let parent = input.parentElement;
        while (parent && parent !== document.body) {
            if (window.getComputedStyle(parent).display === 'none') {
                parentHidden = true;
                break;
            }
            parent = parent.parentElement;
        }

        if (parentHidden) return;

        const
            form = input.closest('form');
        if (form && !formsToProcess.has(form)) {
            formsToProcess.set(form, input);
            visibleInputsFound++;

            // --- Store references when found ---
            lastDetectedForm = form;
            lastDetectedPasswordInput = input;
            // ---
            console.log("Found VISIBLE form for password input:", form, input);
        } else if (!form) {
            console.warn("Visible password input found outside of a form:", input);
        }
    });

    if (visibleInputsFound > 0) {
        console.log(`Found ${visibleInputsFound} visible password form(s) to process.`);
    } else {
        // If no forms found, clear references
        lastDetectedForm = null;
        lastDetectedPasswordInput = null;
    }
    return formsToProcess;
}

/**
 * Adds a button next to a password input within its form.
 * The button state can be one of: generate, copy, or clear.
 * @param {HTMLFormElement} form - The form element.
 * @param {HTMLInputElement} passwordInput - The password input element.
 * @param {string} initialState - Initial button state (default: generate)
 */
function addButton(form, passwordInput, initialState = BUTTON_STATE.GENERATE) {
    // Check if button already exists
    let existingButton = form.querySelector(`button[${BUTTON_ADDED_MARKER}]`);
    if (existingButton) {
        // Button exists, just update its state if needed
        if (existingButton.dataset.buttonState !== initialState) {
            updateButtonState(existingButton, initialState);
        }
        return existingButton;
    }

    console.log(`Adding button (state: ${initialState}) to form associated with input:`, passwordInput);
    // Create new button
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(BUTTON_ADDED_MARKER, 'true');
    button.dataset.buttonState = initialState; // Use dataset instead of setAttribute
    // Set base styling
    button.style.marginLeft = '0px';
    button.style.marginBottom = '10px';
    //button.style.padding = '5px 8px';
    button.style.cursor = 'pointer';
    button.style.fontSize = 'small';
    button.style.verticalAlign = 'middle';
    button.style.lineHeight = 'normal';

    // Set initial content and click handler based on state
    updateButtonState(button, initialState);
    // Insert after password input
    passwordInput.insertAdjacentElement('afterend', button);
    console.log("Inserted button directly after password input.");
    form.setAttribute(BUTTON_ADDED_MARKER, 'true');

    // Attach the click listener to the form (only once!)
    if (!form.dataset.passwordManagerListenerAdded) {
        form.addEventListener('click', handleButtonClick);
        form.dataset.passwordManagerListenerAdded = 'true'; // Prevent duplicate listeners
    }

    return button;
}

/**
 * Updates the button state, content, and click handler.
 * @param {HTMLButtonElement} button - The button to update.
 * @param {string} newState - The new button state.
 */
function updateButtonState(button, newState) {
    if (!button) {
        console.error("Button is null. Cannot update state.");
        return;
    }

    button.dataset.buttonState = newState; // Update the data attribute

    // Update content based on state
    switch (newState) {
        case BUTTON_STATE.GENERATE:
            button.innerHTML = `<img src="${BUTTON_ICON_URL}" alt="" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px; pointer-events: none;">${GENERATE_BUTTON_TEXT}`;
            break;

        case BUTTON_STATE.COPY:
            button.innerHTML = `<img src="${BUTTON_ICON_URL}" alt="" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px; pointer-events: none;">${COPY_BUTTON_TEXT}`;
            break;

        case BUTTON_STATE.CLEAR:
            button.innerHTML = `<img src="${BUTTON_ICON_URL}" alt="" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 6px; pointer-events: none;">${CLEAR_BUTTON_TEXT}`;
            break;
    }
}

/**
 * Handles button clicks based on the button's current state.
 * @param {Event} event - The click event.
 */
function handleButtonClick(event) {
    const button = event.target;

    // Check if the clicked element is one of our buttons
    if (button.hasAttribute(BUTTON_ADDED_MARKER)) {
        event.preventDefault();
        event.stopPropagation();

        const state = button.dataset.buttonState;

        switch (state) {
            case BUTTON_STATE.GENERATE:
                handleGenerateClick(event); // Reuse existing logic
                break;
            case BUTTON_STATE.COPY:
                handleCopyClick(event); // Reuse existing logic
                break;
            case BUTTON_STATE.CLEAR:
                handleClearClick(event); // Reuse existing logic
                break;
            default:
                console.warn("Unknown button state:", state);
        }
    }
}

/**
 * Handles the Unlock & Fill button click.
 * @param {Event} event - The click event.
 */
function handleGenerateClick(event) {
    const button = event.target;
    const originalHTML = button.innerHTML;
    button.innerHTML = 'Checking...';
    button.disabled = true;

    if (!chrome?.runtime?.id) {
        console.warn('Extension context invalidated.');
        alert('Secure Password Manager extension has been updated or reloaded. Please refresh the page.');
        button.innerHTML = originalHTML;
        button.disabled = false;
        return;
    }

    try {
        // Find the associated form and input
        const form = button.closest('form') || lastDetectedForm;
        const passwordInput = form?.querySelector('input[type="password"]') || lastDetectedPasswordInput;

        // Store references
        lastDetectedForm = form;
        lastDetectedPasswordInput = passwordInput;

        chrome.runtime.sendMessage({ action: "generatePassword", url: window.location.href }, (response) => {
            button.disabled = false;

            if (chrome.runtime.lastError) {
                console.error("Content Script: Error sending message:", chrome.runtime.lastError.message);
                alert(`Password Manager Error:\n${chrome.runtime.lastError.message}`);
                button.innerHTML = originalHTML;
                return;
            }

            if (response) {
                console.log("Content Script: Received response:", response);

                if (response.actionRequired === 'openOptions') {
                    console.log("Content Script:  Background requires unlock.");
                    button.textContent = 'Unlock Needed';
                    setTimeout(() => {
                        if (button.textContent === 'Unlock Needed')
                            button.innerHTML = originalHTML;
                    }, 3000);
                } else if (response.password) {
                    console.log("Content Script: Received password directly.");
                    // Store password for copy functionality
                    generatedPasswordCache = response.password;
                    // Fill the form
                    fillLoginForm(form, passwordInput, response.password);
                    // Update button to Copy state
                    updateButtonState(button, BUTTON_STATE.COPY);
                } else if (response.error) {
                    console.error("Content Script: Received error response:", response.error);
                    alert(`Password Manager Error:\n${response.error}`);
                    button.innerHTML = originalHTML;
                } else {
                    console.warn("Content Script: Unexpected response:", response);
                    alert("Password Manager Error:\nUnexpected response.");
                    button.innerHTML = originalHTML;
                }
            } else {
                console.error("Content Script: No response received.");
                alert("Password Manager Error:\nNo response received.");
                button.innerHTML = originalHTML;
            }
        });
    } catch (err) {
        console.error("Content Script: Error calling sendMessage:", err);
        alert("Secure Password Manager encountered an issue.");
        button.innerHTML = originalHTML;
        button.disabled = false;
    }
}

/**
 * Handles the Copy Password button click.
 * @param {Event} event - The click event.
 */
function handleCopyClick(event) {
    const button = event.target;
    if (!generatedPasswordCache) {
        console.error("No password available to copy");
        button.textContent = 'No Password!';
        setTimeout(() => {
            updateButtonState(button, BUTTON_STATE.GENERATE);
        }, 2000);
        return;
    }

    try {
        // Copy to clipboard
        navigator.clipboard.writeText(generatedPasswordCache)
            .then(() => {
                console.log("Password copied to clipboard");
                button.textContent = 'Copied!';

                // Change to Clear button after brief confirmation
                setTimeout(() => {
                    updateButtonState(button, BUTTON_STATE.CLEAR);
                }, 1500);
            })
            .catch(err => {
                console.error("Failed to copy:  ", err);
                button.textContent = 'Copy Failed!';
                setTimeout(() => {
                    // Reset to copy state if copy fails
                    updateButtonState(button, BUTTON_STATE.COPY);
                }, 2000);
            });
    } catch (err) {
        console.error("Error during copy operation:", err);
        button.textContent = 'Error!';
        setTimeout(() => {
            updateButtonState(button, BUTTON_STATE.COPY);
        }, 2000);
    }
}

/**
 * Handles the Clear button click.
 * @param {Event} event - The click event.
 */
function handleClearClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;

    // Clear the clipboard
    navigator.clipboard.writeText("")
        .then(() => {
            console.log("Clipboard cleared.");
            button.textContent = 'Cleared!';
            setTimeout(() => {
                updateButtonState(button, BUTTON_STATE.GENERATE);
            }, 2000);
        })
        .catch(err => {
            console.error("Failed to clear clipboard: ", err);
            button.textContent = 'Clear Failed!';
            setTimeout(() => {
                updateButtonState(button, BUTTON_STATE.COPY);
            }, 2000);
        });

    // Clear cached password
    generatedPasswordCache = null;
    // Show confirmation and reset to generate state
    //button.textContent = 'Cleared!';
    //setTimeout(() => {
    //    updateButtonState(button, BUTTON_STATE.GENERATE);
    //}, 2000);
}

/**
 * Fills the password input field and potentially related fields.
 * @param {HTMLFormElement |
 * null} form - The form element (can be null).
 * @param {HTMLInputElement |
 * null} passwordInput - The password input element (can be null).
 * @param {string} generatedPassword - The password string.
 */
function fillLoginForm(form, passwordInput, generatedPassword) {
    if (passwordInput) {
        passwordInput.value = generatedPassword;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("Content Script: Password field filled and events dispatched.");

        // Try to fill confirm field if available within the same form
        if (form) {
            const confirmInput = form.querySelector('input[type="password"][name*="confirm"], input[type="password"][id*="confirm"]');
            if (confirmInput && confirmInput !== passwordInput) {
                confirmInput.value = generatedPassword;
                confirmInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                confirmInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log("Content Script: Filled potential 'confirm password' field.");
            }
        }
    } else {
        console.error("Content Script: Target password input not found during fill operation.");
        // Optionally alert the user or try re-detection here?
        alert("Password Manager: Could not find the password field to fill automatically. Please try clicking the button again if needed.");
    }
}

// --- Initialization and Dynamic Handling ---
let debounceTimer;

/**
 * Runs the detection logic to find password fields and add buttons.
 */
function runDetection() {
    console.log("Running form detection...");
    try {
        const formsMap = findPasswordInputsAndForms();
        formsMap.forEach((input, form) => {
            // Always start with generate button for new detections
            addButton(form, input, BUTTON_STATE.GENERATE);
        });
    } catch (error) {
        console.error("Error during form detection/button addition:", error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runDetection);
} else {
    runDetection();
} // Already loaded

const observer = new MutationObserver((mutationsList) => {
    let triggerReDetection = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType === Node.ELEMENT_NODE && (addedNode.matches('form, input[type="password"]') || addedNode.querySelector('form, input[type="password"]'))) {
                    triggerReDetection = true;
                    break;
                }
            }
        } else if (mutation.type === 'attributes') {
            if (mutation.target.nodeType === Node.ELEMENT_NODE && mutation.target.matches('input, form, div, span') && (mutation.attributeName === 'style' || mutation.attributeName === 'class' || mutation.attributeName ===
                'hidden' || mutation.attributeName === 'type' || mutation.attributeName === 'disabled' || mutation.attributeName === 'readonly')) {
                triggerReDetection = true;
            }
        }
        if (triggerReDetection) break;
    }
    if (triggerReDetection) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runDetection, DEBOUNCE_DELAY);
    }
});
observer.observe(document.body, { childList: true, subtree: true, attributes: true });
console.log("Content script observer initialized.");
// --- Listener for Auto-Fill Message from Background ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Check if the message is specifically for filling the password
    if (request.action === "fillPassword" && request.password) {
        console.log("Content Script: Received fillPassword message from background.");

        // Store the password for copy functionality
        generatedPasswordCache = request.password;

        // Option 1: Use globally stored references
        if (lastDetectedPasswordInput) {
            console.log("Attempting to fill using stored references:", lastDetectedPasswordInput);
            fillLoginForm(lastDetectedForm, lastDetectedPasswordInput, request.password);

            // Find and update the button state to Copy
            const button = lastDetectedForm?.querySelector(`button[${BUTTON_ADDED_MARKER}]`);
            if (button) {
                updateButtonState(button, BUTTON_STATE.COPY);
            }
        } else {
            // Option 2: Re-run detection if references are missing
            console.warn("No stored references found. Re-running detection to fill password.");
            const formsMap = findPasswordInputsAndForms();
            if (formsMap.size > 0) {
                // Get the first found form/input pair
                const [form, input] = formsMap.entries().next().value;
                console.log("Filling first detected form/input after re-detection:", input);
                fillLoginForm(form, input, request.password);
                // Add or update button to Copy state
                const button = addButton(form, input, BUTTON_STATE.COPY);
            } else {
                console.error("Could not find any password field to fill after  receiving fillPassword message.");
                alert("Password Manager: Could not find the password field to fill automatically after unlock.");
            }
        }
        return false;
    }
});

console.log("Content script message listener for auto-fill added.");

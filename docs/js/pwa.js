const installAppButton = document.getElementById("installAppButton");
const installAppStatus = document.getElementById("installAppStatus");
let pendingInstallPrompt = null;

function showInstallStatus(message) {
  if (!installAppStatus) return;
  installAppStatus.textContent = message;
  installAppStatus.hidden = !message;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .catch(error => {
        console.error("Unable to register the BizPulse service worker:", error);
      });
  }, { once: true });
}

if (installAppButton) {
  if (isIosDevice() && !window.navigator.standalone) {
    installAppButton.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    pendingInstallPrompt = event;
    installAppButton.hidden = false;
  });

  installAppButton.addEventListener("click", async () => {
    if (!pendingInstallPrompt) {
      if (isIosDevice()) {
        showInstallStatus("To install BizPulse, tap Share in Safari, then choose Add to Home Screen.");
      }
      return;
    }

    installAppButton.disabled = true;
    try {
      await pendingInstallPrompt.prompt();
      const { outcome } = await pendingInstallPrompt.userChoice;
      showInstallStatus(outcome === "accepted"
        ? "BizPulse is being installed on your device."
        : "Installation was cancelled. You can install BizPulse later.");
    } catch (error) {
      console.error("Unable to show the BizPulse install prompt:", error);
      showInstallStatus("Unable to start installation. Please try again from your browser menu.");
    } finally {
      pendingInstallPrompt = null;
      installAppButton.disabled = false;
      installAppButton.hidden = true;
    }
  });

  window.addEventListener("appinstalled", () => {
    pendingInstallPrompt = null;
    installAppButton.hidden = true;
    showInstallStatus("BizPulse has been installed.");
  });
}

const installAppButton = document.getElementById("installAppButton");
const installAppStatus = document.getElementById("installAppStatus");
const standaloneDisplayMode = window.matchMedia(
  "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)"
);
let pendingInstallPrompt = null;

function isRunningAsInstalledApp() {
  return standaloneDisplayMode.matches || window.navigator.standalone === true;
}

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
  let appInstalled = isRunningAsInstalledApp();
  installAppButton.hidden = appInstalled;

  const updateStandaloneMode = () => {
    appInstalled = isRunningAsInstalledApp();
    installAppButton.hidden = appInstalled;
    if (appInstalled) {
      showInstallStatus("");
    }
  };
  if (typeof standaloneDisplayMode.addEventListener === "function") {
    standaloneDisplayMode.addEventListener("change", updateStandaloneMode);
  } else if (typeof standaloneDisplayMode.addListener === "function") {
    standaloneDisplayMode.addListener(updateStandaloneMode);
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    pendingInstallPrompt = event;
    installAppButton.hidden = appInstalled;
  });

  installAppButton.addEventListener("click", async () => {
    if (!pendingInstallPrompt) {
      if (isIosDevice()) {
        showInstallStatus("To install BizPulse, tap Share in Safari, then choose Add to Home Screen.");
      } else {
        showInstallStatus("Open your browser menu and choose Install app or Add to Home Screen.");
      }
      return;
    }

    const installPrompt = pendingInstallPrompt;
    pendingInstallPrompt = null;
    installAppButton.disabled = true;
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") {
        showInstallStatus("BizPulse is being installed on your device.");
      } else {
        showInstallStatus("Installation was cancelled. You can install BizPulse later.");
      }
    } catch (error) {
      console.error("Unable to show the BizPulse install prompt:", error);
      showInstallStatus("Unable to start installation. Please try again from your browser menu.");
    } finally {
      installAppButton.disabled = false;
      installAppButton.hidden = appInstalled;
    }
  });

  window.addEventListener("appinstalled", () => {
    appInstalled = true;
    pendingInstallPrompt = null;
    installAppButton.hidden = true;
    showInstallStatus("BizPulse has been installed.");
  });
}

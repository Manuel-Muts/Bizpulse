const installAppButton = document.getElementById("installAppButton");
const installAppStatus = document.getElementById("installAppStatus");
const installedAppStorageKey = "bizpulse-installed-app";
const standaloneDisplayMode = window.matchMedia(
  "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)"
);
let pendingInstallPrompt = null;

function isRunningAsInstalledApp() {
  return standaloneDisplayMode.matches || window.navigator.standalone === true;
}

function hasInstalledAppMarker() {
  try {
    return window.localStorage.getItem(installedAppStorageKey) === "true";
  } catch (error) {
    console.warn("Unable to read the BizPulse install state:", error);
    return false;
  }
}

function rememberInstalledApp() {
  try {
    window.localStorage.setItem(installedAppStorageKey, "true");
  } catch (error) {
    console.warn("Unable to save the BizPulse install state:", error);
  }
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
  let appInstalled = isRunningAsInstalledApp() || hasInstalledAppMarker();
  const isMobileViewport = () => window.matchMedia("(max-width: 600px)").matches;

  if (isRunningAsInstalledApp()) {
    rememberInstalledApp();
  }

  if (appInstalled) {
    installAppButton.hidden = true;
    showInstallStatus("");
  } else if (isMobileViewport()) {
    installAppButton.hidden = false;
  }

  window.addEventListener("resize", () => {
    if (isMobileViewport() && !appInstalled && !isRunningAsInstalledApp()) {
      installAppButton.hidden = false;
    }
  });

  if (isIosDevice() && !appInstalled) {
    installAppButton.hidden = false;
  }

  standaloneDisplayMode.addEventListener("change", () => {
    if (isRunningAsInstalledApp()) {
      appInstalled = true;
      rememberInstalledApp();
      installAppButton.hidden = true;
      showInstallStatus("");
    }
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    pendingInstallPrompt = event;
    if (!appInstalled && !isRunningAsInstalledApp()) {
      installAppButton.hidden = false;
    }
  });

  installAppButton.addEventListener("click", async () => {
    if (!pendingInstallPrompt) {
      if (isIosDevice()) {
        showInstallStatus("To install BizPulse, tap Share in Safari, then choose Add to Home Screen.");
      } else if (isMobileViewport()) {
        showInstallStatus("Open your browser menu and choose Install app or Add to Home Screen.");
      }
      return;
    }

    installAppButton.disabled = true;
    try {
      await pendingInstallPrompt.prompt();
      const { outcome } = await pendingInstallPrompt.userChoice;
      if (outcome === "accepted") {
        appInstalled = true;
        rememberInstalledApp();
      }
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
    appInstalled = true;
    rememberInstalledApp();
    pendingInstallPrompt = null;
    installAppButton.hidden = true;
    showInstallStatus("BizPulse has been installed.");
  });
}

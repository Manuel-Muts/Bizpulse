import { renderAnalyticsItemSalesGraphs } from "./analytics-item-chart.js";

const titleElement = document.getElementById("analyticsGraphsTitle");
const metaElement = document.getElementById("analyticsGraphsMeta");
const statusElement = document.getElementById("analyticsGraphsStatus");
const contentElement = document.getElementById("analyticsGraphsContent");
const graphParams = new URLSearchParams(window.location.search);
let analyticsReturnUrl = new URL("clients", window.location.href).href;
const requestedReturnUrl = graphParams.get("returnTo");
if (requestedReturnUrl) {
  try {
    const returnUrl = new URL(requestedReturnUrl, window.location.href);
    if (returnUrl.origin === window.location.origin) {
      analyticsReturnUrl = returnUrl.href;
    }
  } catch (error) {
    console.warn("Ignoring invalid Analytics return URL:", error);
  }
}
document.getElementById("analyticsGraphsBack").addEventListener("click", () => {
  window.close();
  window.setTimeout(() => {
    if (!window.closed) window.location.assign(analyticsReturnUrl);
  }, 100);
});
document.getElementById("analyticsGraphsPrint").addEventListener("click", () => window.print());
const channelToken = graphParams.get("channel");

if (!channelToken || !/^[\w-]+$/.test(channelToken) || !("BroadcastChannel" in window)) {
  statusElement.textContent = "Could not connect to the Analytics window. Close this tab and open the graphs again.";
} else {
  const channel = new BroadcastChannel(`analytics-item-graphs-${channelToken}`);
  let receivedData = false;
  const connectionTimeout = window.setTimeout(() => {
    if (receivedData) return;
    channel.close();
    statusElement.textContent =
      "No graph data arrived from Analytics. Keep the Analytics page open and try again.";
  }, 30000);

  channel.addEventListener("message", event => {
    if (event.data?.type !== "analytics-graphs-data") return;
    const payload = event.data.payload;
    if (!payload || typeof payload.title !== "string" ||
        typeof payload.dateRange !== "string" ||
        !Array.isArray(payload.rankings)) {
      channel.close();
      window.clearTimeout(connectionTimeout);
      statusElement.textContent = "The Analytics page sent invalid graph data.";
      return;
    }

    receivedData = true;
    channel.close();
    window.clearTimeout(connectionTimeout);
    titleElement.textContent = payload.title;
    metaElement.textContent = `${payload.periodLabel} · ${payload.dateRange}`;
    statusElement.hidden = true;
    contentElement.hidden = false;
    renderAnalyticsItemSalesGraphs(contentElement, payload.rankings);
  });
  channel.postMessage({ type: "analytics-graphs-ready" });
}

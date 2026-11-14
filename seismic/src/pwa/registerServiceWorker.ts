export async function registerServiceWorker(nav: Navigator = navigator): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in nav) || import.meta.env.DEV) return null;
  try {
    return await nav.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("[seismic] service worker registration failed", err);
    return null;
  }
}

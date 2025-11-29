if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .then(() => console.log("SW attivo"))
    .catch(err => console.error("SW NON REGISTRATO:", err));
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LanguageProvider, useLanguage } from "./i18n";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Feedback";
import "./styles.css";

function Root() {
  const { t } = useLanguage();
  return (
    <ErrorBoundary
      labels={{
        title: t("Something went wrong"),
        description: t("The workspace hit an unexpected error. Your saved records are safe; try recovering the view."),
        reload: t("Reload app"),
        reset: t("Try again"),
      }}
    >
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <Root />
    </LanguageProvider>
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // PWA caching is optional; the app still works normally if registration fails.
    });
  });
}

import React from "react";
import ReactDOM from "react-dom/client";
import FinanceApp from "./FinanceApp.jsx";
import "./index.css";

// Con registerType "autoUpdate" el SW se actualiza en segundo plano, pero la pestaña
// activa puede quedar con un bundle viejo a medio actualizar hasta el próximo refresh.
// Cuando el SW nuevo toma el control (controllerchange), recargamos una sola vez.
// Guardamos contra la primera instalación (sin controller previo) para no recargar
// en la primera visita.
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FinanceApp />
  </React.StrictMode>
);

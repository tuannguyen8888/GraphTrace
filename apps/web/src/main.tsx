import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./app.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("GraphTrace web app could not find the root element.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

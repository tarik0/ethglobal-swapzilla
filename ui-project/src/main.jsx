import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import Hero from "./components/Hero.jsx";
import { Toaster } from "@/components/ui/toaster";
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* <Header /> */}
    <Hero />
    <App />
    <Toaster />
  </React.StrictMode>
);

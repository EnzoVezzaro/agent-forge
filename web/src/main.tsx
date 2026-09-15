import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./ui/AppShell.js";
import "./ui/styles.css";

function App(): React.JSX.Element {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, "") || "catalog");
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#\/?/, "") || "catalog");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = useCallback((to: string) => {
    window.location.hash = `#/${to}`;
  }, []);
  return <AppShell route={route} navigate={navigate} />;
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

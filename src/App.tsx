import { useEffect, useState } from "react";
import { useCrest } from "./store";
import { Crest } from "./components/Crest";
import { Settings } from "./components/Settings";
import { Onboarding } from "./components/Onboarding";
import { UsagePanel } from "./components/UsagePanel";

type View = "crest" | "settings" | "onboarding" | "usage";

function currentView(): View {
  const hash = window.location.hash.replace("#", "");
  if (hash === "settings") return "settings";
  if (hash === "onboarding") return "onboarding";
  if (hash === "usage") return "usage";
  return "crest";
}

export default function App() {
  const [view, setView] = useState<View>(currentView);
  const ingest = useCrest((s) => s.ingest);

  useEffect(() => {
    const onHash = () => setView(currentView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.body.dataset.view = view;
  }, [view]);

  useEffect(() => {
    // Instantané initial puis flux poussé par le processus principal.
    void window.crest.snapshot().then(ingest);
    return window.crest.onState(ingest);
  }, [ingest]);

  if (view === "onboarding") return <Onboarding />;
  if (view === "settings") return <Settings />;
  if (view === "usage") return <UsagePanel />;
  return <Crest />;
}

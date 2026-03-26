import "./App.css";
import { useEffect, useSyncExternalStore } from "react";

import DashboardPage from "./pages/DashboardPage";
import OnboardingPage from "./pages/OnboardingPage";
import { configStore } from "./stores/configStore";

function App() {
  const state = useSyncExternalStore(
    configStore.subscribe,
    configStore.getState,
    configStore.getState,
  );

  useEffect(() => {
    if (!state.loaded && !state.loading) {
      void configStore.load();
    }
  }, [state.loaded, state.loading]);

  const handlePickDirectories = async () => {
    const paths = await configStore.pickDirectories(true);

    if (paths.length > 0) {
      configStore.addWatchPaths(paths);
    }
  };

  const handleSave = async () => {
    await configStore.save(configStore.getState().config);
  };

  if (!state.loaded) {
    return (
      <main className="shell">
        <section className="panel hero-panel">
          <p className="eyebrow">ScriptMan</p>
          <h1>Loading local configuration...</h1>
          <p className="body">
            Checking whether this machine already has saved watch paths.
          </p>
        </section>
      </main>
    );
  }

  if (state.needsOnboarding) {
    return (
      <OnboardingPage
        watchPaths={state.config.watchPaths}
        saving={state.saving}
        error={state.error}
        onPickDirectories={handlePickDirectories}
        onRemoveWatchPath={(path) => configStore.removeWatchPath(path)}
        onSave={handleSave}
      />
    );
  }

  return (
    <DashboardPage
      watchPaths={state.config.watchPaths}
      defaultCwd={state.config.defaultCwd}
      savingWatchPaths={state.saving}
      configError={state.error}
      onPickDirectories={handlePickDirectories}
      onRemoveWatchPath={(path) => configStore.removeWatchPath(path)}
      onSaveWatchPaths={handleSave}
    />
  );
}

export default App;

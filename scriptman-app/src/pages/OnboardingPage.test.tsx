import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import OnboardingPage from "./OnboardingPage";

describe("OnboardingPage", () => {
  it("shows validation error when saving without any watch path", async () => {
    const user = userEvent.setup();

    render(
      <OnboardingPage
        watchPaths={[]}
        saving={false}
        error={null}
        onPickDirectories={vi.fn()}
        onRemoveWatchPath={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save and continue/i }));

    expect(
      screen.getByText(/add at least one directory before continuing/i),
    ).toBeInTheDocument();
  });

  it("renders selected watch paths", () => {
    render(
      <OnboardingPage
        watchPaths={["/a", "/b"]}
        saving={false}
        error={null}
        onPickDirectories={vi.fn()}
        onRemoveWatchPath={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("/a")).toBeInTheDocument();
    expect(screen.getByText("/b")).toBeInTheDocument();
  });
});

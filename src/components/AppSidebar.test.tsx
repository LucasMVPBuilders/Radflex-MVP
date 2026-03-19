import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppSidebar } from "./AppSidebar";

describe("AppSidebar", () => {
  it("renders a navigation link to the pipeline page", () => {
    render(
      <MemoryRouter>
        <AppSidebar />
      </MemoryRouter>
    );

    const pipelineLink = screen.getByRole("link", { name: /pipeline/i });

    expect(pipelineLink).toBeInTheDocument();
    expect(pipelineLink).toHaveAttribute("href", "/pipeline");
  });
});

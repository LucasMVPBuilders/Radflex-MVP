import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Outlet } from "react-router-dom";
import App from "./App";

vi.mock("./pages/Index.tsx", () => ({
  default: () => <div>Index Page</div>,
}));

vi.mock("./pages/Disparos.tsx", () => ({
  default: () => <div>Disparos Page</div>,
}));

vi.mock("./pages/Login.tsx", () => ({
  default: () => <div>Login Page</div>,
}));

vi.mock("./pages/ResetPassword.tsx", () => ({
  default: () => <div>Reset Password Page</div>,
}));

vi.mock("./pages/Pipeline.tsx", () => ({
  default: () => <div>Pipeline Page</div>,
}));

vi.mock("./pages/UpdatePassword.tsx", () => ({
  default: () => <div>Update Password Page</div>,
}));

vi.mock("./pages/NotFound.tsx", () => ({
  default: () => <div>Not Found</div>,
}));

vi.mock("./components/ProtectedRoute.tsx", () => ({
  ProtectedRoute: () => <Outlet />,
}));

describe("App routes", () => {
  it("renders the temporary test chat page at /test-chat", async () => {
    window.history.pushState({}, "", "/test-chat");

    render(<App />);

    expect(await screen.findByText("Chat temporario de teste")).toBeInTheDocument();
  });

  it("renders the pipeline page at /pipeline", async () => {
    window.history.pushState({}, "", "/pipeline");

    render(<App />);

    expect(await screen.findByText("Pipeline Page")).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Disparos from "./pages/Disparos.tsx";
import Login from "./pages/Login.tsx";
import Pipeline from "./pages/Pipeline.tsx";
import SDRConfig from "./pages/SDRConfig.tsx";
import TestChat from "./pages/TestChat.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import UpdatePassword from "./pages/UpdatePassword.tsx";
import NotFound from "./pages/NotFound.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/update-password" element={<UpdatePassword />} />
          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Index />} />
            <Route path="/disparos" element={<Disparos />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/sdr" element={<SDRConfig />} />
            <Route path="/test-chat" element={<TestChat />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import MortgageProtection from "./pages/MortgageProtection.tsx";
import MortgageCoverage from "./pages/MortgageCoverage.tsx";
import FamilyProtection from "./pages/FamilyProtection.tsx";
import MortgageQuiz from "./pages/MortgageQuiz.tsx";
import About from "./pages/About.tsx";
import Contact from "./pages/Contact.tsx";
import LifeInsurance from "./pages/LifeInsurance.tsx";
import FinalExpense from "./pages/FinalExpense.tsx";
import AgentOnboarding from "./pages/AgentOnboarding.tsx";
import OnboardingSuccess from "./pages/OnboardingSuccess.tsx";
import OnboardingActivate from "./pages/OnboardingActivate.tsx";
import PortalLogin from "./pages/PortalLogin.tsx";
import PortalSetPassword from "./pages/PortalSetPassword.tsx";
import PortalDashboard from "./pages/PortalDashboard.tsx";
import PortalCarrierSheet from "./pages/PortalCarrierSheet.tsx";
import AdminLayout from "./components/AdminLayout.tsx";
import AdminRoute from "./components/AdminRoute.tsx";
import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import AdminHierarchy from "./pages/admin/AdminHierarchy.tsx";
import AdminUsers from "./pages/admin/AdminUsers.tsx";
import AdminAddUser from "./pages/admin/AdminAddUser.tsx";
import AdminIncentives from "./pages/admin/AdminIncentives.tsx";
import AdminCarriers from "./pages/admin/AdminCarriers.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/mortgage-protection" element={<MortgageProtection />} />
          <Route path="/mortgage-coverage" element={<MortgageCoverage />} />
          <Route path="/family-protection" element={<FamilyProtection />} />
          <Route path="/mortgage-quiz" element={<MortgageQuiz />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/life-insurance" element={<LifeInsurance />} />
          <Route path="/final-expense" element={<FinalExpense />} />
          <Route path="/onboarding" element={<AgentOnboarding />} />
          <Route path="/onboarding/success/:onboardingId" element={<OnboardingSuccess />} />
          <Route path="/onboarding/activate" element={<OnboardingActivate />} />
          <Route path="/portal/login" element={<PortalLogin />} />
          <Route path="/portal/set-password" element={<PortalSetPassword />} />
          <Route
            path="/portal"
            element={
              <ProtectedRoute>
                <PortalDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/carriers"
            element={
              <ProtectedRoute>
                <PortalCarrierSheet />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/admin"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="hierarchy" element={<AdminHierarchy />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/new" element={<AdminAddUser />} />
            <Route path="incentives" element={<AdminIncentives />} />
            <Route path="carriers" element={<AdminCarriers />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

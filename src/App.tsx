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
import PortalBrandAssets from "./pages/PortalBrandAssets.tsx";
import PortalProfile from "./pages/PortalProfile.tsx";
import PortalW9 from "./pages/PortalW9.tsx";
import PortalIca from "./pages/PortalIca.tsx";
import PortalDirectDeposit from "./pages/PortalDirectDeposit.tsx";
import PortalCompAgreement from "./pages/PortalCompAgreement.tsx";
import PortalDisclosures from "./pages/PortalDisclosures.tsx";
import PortalSupport from "./pages/PortalSupport.tsx";
import PortalPayPolicy from "./pages/PortalPayPolicy.tsx";
import PortalClients from "./pages/PortalClients.tsx";
import PortalClientIntake from "./pages/PortalClientIntake.tsx";
import AdminLayout from "./components/AdminLayout.tsx";
import AdminRoute from "./components/AdminRoute.tsx";
import AdminFullRoute from "./components/AdminFullRoute.tsx";
import AdminIndexRedirect from "./components/AdminIndexRedirect.tsx";
import AdminHierarchy from "./pages/admin/AdminHierarchy.tsx";
import AdminUsers from "./pages/admin/AdminUsers.tsx";
import AdminUserDetail from "./pages/admin/AdminUserDetail.tsx";
import AdminAddUser from "./pages/admin/AdminAddUser.tsx";
import AdminIncentives from "./pages/admin/AdminIncentives.tsx";
import AdminBrandAssets from "./pages/admin/AdminBrandAssets.tsx";
import AdminCarriers from "./pages/admin/AdminCarriers.tsx";
import AdminGenesis from "./pages/admin/AdminGenesis.tsx";
import AdminContracting from "./pages/admin/AdminContracting.tsx";
import AdminLeadCharges from "./pages/admin/AdminLeadCharges.tsx";
import AdminTickets from "./pages/admin/AdminTickets.tsx";
import AdminPayPolicy from "./pages/admin/AdminPayPolicy.tsx";
import AdminGmailVerification from "./pages/admin/AdminGmailVerification.tsx";
import AdminClients from "./pages/admin/AdminClients.tsx";
import AdminDashboardTabs from "./pages/admin/AdminDashboardTabs.tsx";
import AdminTodos from "./pages/admin/AdminTodos.tsx";
import AdminOnboardingPreview from "./pages/admin/AdminOnboardingPreview.tsx";
import AdminW9Preview from "./pages/admin/AdminW9Preview.tsx";
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
            path="/portal/brand-assets"
            element={
              <ProtectedRoute>
                <PortalBrandAssets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/profile"
            element={
              <ProtectedRoute>
                <PortalProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/w9"
            element={
              <ProtectedRoute>
                <PortalW9 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/ica"
            element={
              <ProtectedRoute>
                <PortalIca />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/direct-deposit"
            element={
              <ProtectedRoute>
                <PortalDirectDeposit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/comp-agreement"
            element={
              <ProtectedRoute>
                <PortalCompAgreement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/disclosures"
            element={
              <ProtectedRoute>
                <PortalDisclosures />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/support"
            element={
              <ProtectedRoute>
                <PortalSupport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/pay-policy"
            element={
              <ProtectedRoute>
                <PortalPayPolicy />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/clients"
            element={
              <ProtectedRoute>
                <PortalClients />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/clients/new"
            element={
              <ProtectedRoute>
                <PortalClientIntake />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/admin"
            element={
              <ProtectedRoute>
                <AdminRoute allowAdminAssist>
                  <AdminLayout />
                </AdminRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminIndexRedirect />} />
            <Route path="hierarchy" element={<AdminFullRoute allowAdminAssist><AdminHierarchy /></AdminFullRoute>} />
            <Route path="users" element={<AdminFullRoute><AdminUsers /></AdminFullRoute>} />
            <Route path="gmail-verification" element={<AdminFullRoute><AdminGmailVerification /></AdminFullRoute>} />
            <Route path="users/new" element={<AdminFullRoute><AdminAddUser /></AdminFullRoute>} />
            <Route path="users/:userId" element={<AdminFullRoute><AdminUserDetail /></AdminFullRoute>} />
            <Route path="incentives" element={<AdminFullRoute><AdminIncentives /></AdminFullRoute>} />
            <Route path="brand-assets" element={<AdminFullRoute><AdminBrandAssets /></AdminFullRoute>} />
            <Route path="carriers" element={<AdminFullRoute><AdminCarriers /></AdminFullRoute>} />
            <Route path="clients" element={<AdminFullRoute><AdminClients /></AdminFullRoute>} />
            <Route path="dashboard-tabs" element={<AdminFullRoute><AdminDashboardTabs /></AdminFullRoute>} />
            <Route path="todos" element={<AdminFullRoute><AdminTodos /></AdminFullRoute>} />
            <Route path="genesis" element={<AdminGenesis />} />
            <Route path="contracting" element={<AdminFullRoute><AdminContracting /></AdminFullRoute>} />
            <Route path="lead-charges" element={<AdminFullRoute><AdminLeadCharges /></AdminFullRoute>} />
            <Route path="tickets" element={<AdminFullRoute><AdminTickets /></AdminFullRoute>} />
            <Route path="pay-policy" element={<AdminFullRoute><AdminPayPolicy /></AdminFullRoute>} />
          </Route>
          <Route
            path="/portal/admin/w9-preview"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminW9Preview />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/admin/onboarding-preview"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminOnboardingPreview />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

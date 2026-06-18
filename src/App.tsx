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
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

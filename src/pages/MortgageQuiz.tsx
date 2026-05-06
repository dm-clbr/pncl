import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { submitLead } from "@/lib/web3forms";
import { toast } from "sonner";
import { trackPageView, trackFormSubmission } from "@/lib/analytics";

interface Answers {
  ownsHome?: string;
  hasMortgage?: string;
  mortgageBalance?: string;
  hasInsurance?: string;
  familyKeepHouse?: string;
  ageRange?: string;
}

const STEPS = [
  {
    question: "Do you currently own a home?",
    subtitle: "Let's start with the basics.",
    options: ["Yes", "No"],
    key: "ownsHome" as keyof Answers,
  },
  {
    question: "Do you have a mortgage on your home?",
    subtitle: "This helps us understand your situation.",
    options: ["Yes, I'm still paying", "No, it's paid off"],
    key: "hasMortgage" as keyof Answers,
  },
  {
    question: "What's your remaining mortgage balance?",
    subtitle: "An estimate is fine.",
    options: ["Under $100K", "$100K – $250K", "$250K – $500K", "$500K+"],
    key: "mortgageBalance" as keyof Answers,
  },
  {
    question: "Do you currently have life insurance that covers your mortgage?",
    subtitle: "Many homeowners don't — and that's okay.",
    options: ["Yes", "No", "I'm not sure"],
    key: "hasInsurance" as keyof Answers,
  },
  {
    question: "If something happened to you tomorrow, could your family keep the house?",
    subtitle: "Be honest with yourself.",
    options: ["Yes, they'd be fine", "They'd struggle", "I don't know"],
    key: "familyKeepHouse" as keyof Answers,
  },
  {
    question: "What's your age range?",
    subtitle: "This affects your estimated rate.",
    options: ["25–34", "35–44", "45–54", "55–64", "65+"],
    key: "ageRange" as keyof Answers,
  },
];

function getEstimate(answers: Answers) {
  const balanceMap: Record<string, number> = {
    "Under $100K": 75000,
    "$100K – $250K": 175000,
    "$250K – $500K": 375000,
    "$500K+": 600000,
  };
  const rateMap: Record<string, number> = {
    "25–34": 0.08,
    "35–44": 0.14,
    "45–54": 0.22,
    "55–64": 0.38,
    "65+": 0.55,
  };
  const balance = balanceMap[answers.mortgageBalance || ""] || 200000;
  const ratePer1000 = rateMap[answers.ageRange || ""] || 0.18;
  const monthly = Math.round((balance / 1000) * ratePer1000);
  return { balance, monthly: Math.max(monthly, 12) };
}

const EMOTIONAL_STAT = "Every year, 1 in 4 families lose their home after the unexpected loss of a breadwinner.";

const FORM_STEPS = [
  {
    question: "What's your first name?",
    subtitle: "So we know who we're preparing this for.",
    field: "name" as const,
    type: "text",
    placeholder: "First name",
  },
  {
    question: "What's the best email to send your quote?",
    subtitle: "We'll send your estimate here — no spam, ever.",
    field: "email" as const,
    type: "email",
    placeholder: "you@example.com",
  },
  {
    question: "And a phone number, just in case?",
    subtitle: "Only if you'd like a quick call to walk through options.",
    field: "phone" as const,
    type: "tel",
    placeholder: "(555) 123-4567",
  },
];

export default function MortgageQuiz() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [transitioning, setTransitioning] = useState(false);
  const [showEmotionalStat, setShowEmotionalStat] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "" });
  const [softExit, setSoftExit] = useState(false);
  const [loading, setLoading] = useState(false);

  const totalQuizSteps = STEPS.length;
  const totalAllSteps = totalQuizSteps + 1 + FORM_STEPS.length;
  const progress = Math.min((currentStep / totalAllSteps) * 100, 100);

  const advance = () => {
    setTransitioning(true);
    setTimeout(() => {
      setCurrentStep((s) => s + 1);
      setTransitioning(false);
      setShowEmotionalStat(false);
    }, 400);
  };

  const handleSelect = (key: keyof Answers, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));

    if (key === "ownsHome" && value === "No") {
      setSoftExit(true);
      return;
    }

    if (key === "familyKeepHouse" && (value === "They'd struggle" || value === "I don't know")) {
      setShowEmotionalStat(true);
      setTimeout(() => advance(), 3500);
      return;
    }

    advance();
  };

  const handleFormAdvance = async () => {
    const formStepIndex = currentStep - totalQuizSteps - 1;
    const currentField = FORM_STEPS[formStepIndex]?.field;
    if (currentField && !formData[currentField].trim()) return;

    // Last form field → submit to Web3Forms then unlock
    if (formStepIndex === FORM_STEPS.length - 1) {
      setLoading(true);
      const estimate = getEstimate(answers);
      try {
        const leadData = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          source: "mortgage-quiz",
          owns_home: answers.ownsHome || "",
          has_mortgage: answers.hasMortgage || "",
          mortgage_balance: answers.mortgageBalance || "",
          has_insurance: answers.hasInsurance || "",
          family_keep_house: answers.familyKeepHouse || "",
          age_range: answers.ageRange || "",
          estimated_coverage: `$${estimate.balance.toLocaleString()}`,
          estimated_rate: `$${estimate.monthly}/mo`,
        };
        trackFormSubmission("mortgage-quiz", leadData);
        await submitLead(leadData);
        setTransitioning(true);
        setTimeout(() => {
          setUnlocked(true);
          setCurrentStep(totalAllSteps);
          setTransitioning(false);
        }, 400);
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    advance();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFormAdvance();
    }
  };

  const estimate = getEstimate(answers);

  const isQuizStep = currentStep < totalQuizSteps;
  const isResultTeaser = currentStep === totalQuizSteps;
  const formStepIndex = currentStep - totalQuizSteps - 1;
  const isFormStep = formStepIndex >= 0 && formStepIndex < FORM_STEPS.length && !unlocked;

  useEffect(() => {
    document.title = "Mortgage Protection Quiz — See Your Rate | PNCL";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Answer 6 quick questions to see if you qualify for mortgage protection insurance. Get your estimated rate in under 60 seconds.");
    trackPageView('mortgage-quiz');
  }, []);

  return (
    <div className="quiz-container">
      <div className="quiz-progress-bar">
        <div className="quiz-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="quiz-brand">
        <Link to="/" className="quiz-brand-link">PNCL</Link>
      </div>

      {/* Soft exit */}
      {softExit && (
        <div className="quiz-card quiz-fade-in">
          <div className="quiz-card-inner">
            <p className="quiz-emoji">🏠</p>
            <h2 className="quiz-question">We can still help.</h2>
            <p className="quiz-subtitle">
              Even if you don't own a home yet, protecting your family's future starts now.
            </p>
            <Link to="/family-protection" className="quiz-cta-btn" style={{ marginTop: "2rem", display: "inline-block" }}>
              Explore Family Protection →
            </Link>
          </div>
        </div>
      )}

      {/* Quiz steps */}
      {!softExit && isQuizStep && (
        <div className={`quiz-card ${transitioning ? "quiz-fade-out" : "quiz-fade-in"}`}>
          <div className="quiz-card-inner">
            <span className="quiz-step-label">Question {currentStep + 1} of {totalQuizSteps}</span>
            <h2 className="quiz-question">{STEPS[currentStep].question}</h2>
            <p className="quiz-subtitle">{STEPS[currentStep].subtitle}</p>

            {showEmotionalStat ? (
              <div className="quiz-emotional-stat quiz-fade-in">
                <p>{EMOTIONAL_STAT}</p>
              </div>
            ) : (
              <div className="quiz-options">
                {STEPS[currentStep].options.map((opt) => (
                  <button
                    key={opt}
                    className={`quiz-option-btn ${answers[STEPS[currentStep].key] === opt ? "selected" : ""}`}
                    onClick={() => handleSelect(STEPS[currentStep].key, opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Result teaser */}
      {!softExit && isResultTeaser && (
        <div className="quiz-card quiz-fade-in">
          <div className="quiz-card-inner">
            <span className="quiz-step-label">Your Estimate</span>
            <h2 className="quiz-question" style={{ fontSize: "1.6rem" }}>
              We've got your numbers ready.
            </h2>
            <p className="quiz-subtitle">
              Just a few quick details so we can send you your personalized estimate.
            </p>

            <div className="quiz-result-teaser">
              <div className="quiz-result-blurred">
                <p className="quiz-result-label">You could protect your</p>
                <p className="quiz-result-amount">
                  ${estimate.balance.toLocaleString()} mortgage
                </p>
                <p className="quiz-result-label">for as little as</p>
                <p className="quiz-result-rate">${estimate.monthly}/mo</p>
              </div>
              <div className="quiz-result-lock-overlay">
                <span className="quiz-lock-icon">🔒</span>
                <p>A few more steps to see your rate</p>
              </div>
            </div>

            <button className="quiz-cta-btn" onClick={advance}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Form fields — one at a time */}
      {!softExit && isFormStep && (
        <div className={`quiz-card ${transitioning ? "quiz-fade-out" : "quiz-fade-in"}`}>
          <div className="quiz-card-inner">
            <span className="quiz-step-label">
              Step {formStepIndex + 1} of {FORM_STEPS.length}
            </span>
            <h2 className="quiz-question" style={{ fontSize: "1.5rem" }}>
              {FORM_STEPS[formStepIndex].question}
            </h2>
            <p className="quiz-subtitle">{FORM_STEPS[formStepIndex].subtitle}</p>

            <div className="quiz-form-single">
              <input
                key={FORM_STEPS[formStepIndex].field}
                type={FORM_STEPS[formStepIndex].type}
                placeholder={FORM_STEPS[formStepIndex].placeholder}
                value={formData[FORM_STEPS[formStepIndex].field]}
                onChange={(e) =>
                  setFormData({ ...formData, [FORM_STEPS[formStepIndex].field]: e.target.value })
                }
                onKeyDown={handleKeyDown}
                className="quiz-input quiz-input-large"
                autoFocus
              />
              <button
                className="quiz-cta-btn"
                onClick={handleFormAdvance}
                disabled={!formData[FORM_STEPS[formStepIndex].field].trim() || loading}
                style={{ opacity: formData[FORM_STEPS[formStepIndex].field].trim() && !loading ? 1 : 0.4 }}
              >
                {loading ? "Submitting…" : formStepIndex === FORM_STEPS.length - 1 ? "See My Estimate →" : "Continue →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlocked result */}
      {!softExit && unlocked && (
        <div className="quiz-card quiz-fade-in">
          <div className="quiz-card-inner">
            <span className="quiz-emoji">🎉</span>
            <h2 className="quiz-question" style={{ fontSize: "1.5rem" }}>
              {formData.name.split(" ")[0] || "Hey"}, here's your estimate
            </h2>

            <div className="quiz-result-unlocked">
              <p className="quiz-result-label">Protect your</p>
              <p className="quiz-result-amount">
                ${estimate.balance.toLocaleString()} mortgage
              </p>
              <p className="quiz-result-label">for as little as</p>
              <p className="quiz-result-rate quiz-result-rate-unlocked">${estimate.monthly}/mo</p>
            </div>

            <p className="quiz-subtitle" style={{ marginTop: "1.5rem" }}>
              A PNCL advisor will reach out within 24 hours to walk you through your options.
              No pressure — just answers.
            </p>

            <Link to="/mortgage-protection" className="quiz-cta-btn" style={{ marginTop: "1.5rem", display: "inline-block" }}>
              Learn More About Coverage →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

import { getSupabaseClient } from "@/lib/supabase";

export interface ClientIntakeFormData {
  address: string;
  dateMet: string;
  effDate: string;

  primaryFirstName: string;
  primaryLastName: string;
  primaryAge: string;
  primaryPhone: string;
  primaryEmail: string;
  primaryJob: string;
  primaryDob: string;
  primaryMonthlyIncome: string;
  primarySmoker: string;
  primarySmokerDetails: string;
  primaryHeight: string;
  primaryWeight: string;
  primarySurgeries: string;
  hasMedications: string;
  primaryMedications: string;
  primaryMedicalConditions: string;
  primaryDiabetesDetails: string;
  primaryHeartDetails: string;
  primaryHbpDetails: string;
  primaryDuiFelonies: string;
  primaryEmploymentStatus: string;
  primaryEmploymentDetails: string;
  primaryDisabilityCoverage: string;
  primaryLeftOver: string;

  hasSpouse: string;
  spouseFirstName: string;
  spouseLastName: string;
  spouseAge: string;
  spousePhone: string;
  spouseEmail: string;
  spouseJob: string;
  spouseDob: string;
  spouseMonthlyIncome: string;
  spouseSmoker: string;
  spouseSmokerDetails: string;
  spouseHeight: string;
  spouseWeight: string;
  spouseSurgeries: string;
  spouseMedicationsHealth: string;
  spouseLeftOver: string;

  loanBalance: string;
  monthlyPayment: string;
  lender: string;
  monthsBillsSaved: string;
  yearsLeftMortgage: string;

  hasBeneficiary: string;
  beneficiaryName: string;
  beneficiaryHasFamily: string;
  beneficiaryPlan: string;
  beneficiaryNotes: string;

  hasCriticalIllness: string;
  criticalIllnessPolicies: string;
  existingCoverage: string;
  workInsuranceNotes: string;

  annuity1Type: string;
  annuity1Amount: string;
  annuity2Type: string;
  annuity2Amount: string;
  annuity3Type: string;
  annuity3Amount: string;

  policy1Carrier: string;
  policy1Exp: string;
  policy1Amt: string;
  policy1Pymt: string;
  policy2Carrier: string;
  policy2Exp: string;
  policy2Amt: string;
  policy2Pymt: string;

  primaryDln: string;
  primaryDlnState: string;
  primarySsn: string;
  primaryBirthState: string;
  primaryBank: string;
  primaryRouting: string;
  primaryAccount: string;
  primaryDraftDate: string;

  spouseDln: string;
  spouseDlnState: string;
  spouseSsn: string;
  spouseBirthState: string;
  spouseBank: string;
  spouseRouting: string;
  spouseAccount: string;
  spouseDraftDate: string;

  soldPolicy1Carrier: string;
  soldPolicy1Face: string;
  soldPolicy1Pymt: string;
  soldPolicy1Beneficiary1: string;
  soldPolicy1Beneficiary1Rel: string;
  soldPolicy1Beneficiary2: string;
  soldPolicy1Beneficiary2Rel: string;

  soldPolicy2Carrier: string;
  soldPolicy2Face: string;
  soldPolicy2Pymt: string;
  soldPolicy2Beneficiary1: string;
  soldPolicy2Beneficiary1Rel: string;
  soldPolicy2Beneficiary2: string;
  soldPolicy2Beneficiary2Rel: string;

  quoteGood: string;
  quoteBetter: string;
  quoteBest: string;
  notes: string;
  otherInfo: string;
}

export type ClientIntakeFieldKey = keyof ClientIntakeFormData;
export type ClientIntakeStepKey = ClientIntakeFieldKey | "_primaryName" | "_primaryHeightWeight";

export interface ClientIntakeStep {
  key: ClientIntakeStepKey;
  secondaryKey?: ClientIntakeFieldKey;
  scriptQuestion?: number;
  question: string;
  subtitle?: string;
  type: "text" | "tel" | "textarea" | "yesno" | "select" | "dual";
  placeholder?: string;
  secondaryPlaceholder?: string;
  required?: boolean;
  options?: string[];
  section?: string;
  variant?: "working-income" | "retired-income";
}

export interface PortalClientRecord {
  id: string;
  agent_user_id: string;
  primary_first_name: string;
  primary_last_name: string;
  primary_phone: string | null;
  primary_email: string | null;
  address: string | null;
  date_met: string | null;
  form_data: ClientIntakeFormData;
  created_at: string;
  updated_at: string;
}

export const EMPTY_CLIENT_INTAKE: ClientIntakeFormData = {
  address: "",
  dateMet: "",
  effDate: "",
  primaryFirstName: "",
  primaryLastName: "",
  primaryAge: "",
  primaryPhone: "",
  primaryEmail: "",
  primaryJob: "",
  primaryDob: "",
  primaryMonthlyIncome: "",
  primarySmoker: "",
  primarySmokerDetails: "",
  primaryHeight: "",
  primaryWeight: "",
  primarySurgeries: "",
  hasMedications: "",
  primaryMedications: "",
  primaryMedicalConditions: "",
  primaryDiabetesDetails: "",
  primaryHeartDetails: "",
  primaryHbpDetails: "",
  primaryDuiFelonies: "",
  primaryEmploymentStatus: "",
  primaryEmploymentDetails: "",
  primaryDisabilityCoverage: "",
  primaryLeftOver: "",
  hasSpouse: "",
  spouseFirstName: "",
  spouseLastName: "",
  spouseAge: "",
  spousePhone: "",
  spouseEmail: "",
  spouseJob: "",
  spouseDob: "",
  spouseMonthlyIncome: "",
  spouseSmoker: "",
  spouseSmokerDetails: "",
  spouseHeight: "",
  spouseWeight: "",
  spouseSurgeries: "",
  spouseMedicationsHealth: "",
  spouseLeftOver: "",
  loanBalance: "",
  monthlyPayment: "",
  lender: "",
  monthsBillsSaved: "",
  yearsLeftMortgage: "",
  hasBeneficiary: "",
  beneficiaryName: "",
  beneficiaryHasFamily: "",
  beneficiaryPlan: "",
  beneficiaryNotes: "",
  hasCriticalIllness: "",
  criticalIllnessPolicies: "",
  existingCoverage: "",
  workInsuranceNotes: "",
  annuity1Type: "",
  annuity1Amount: "",
  annuity2Type: "",
  annuity2Amount: "",
  annuity3Type: "",
  annuity3Amount: "",
  policy1Carrier: "",
  policy1Exp: "",
  policy1Amt: "",
  policy1Pymt: "",
  policy2Carrier: "",
  policy2Exp: "",
  policy2Amt: "",
  policy2Pymt: "",
  primaryDln: "",
  primaryDlnState: "",
  primarySsn: "",
  primaryBirthState: "",
  primaryBank: "",
  primaryRouting: "",
  primaryAccount: "",
  primaryDraftDate: "",
  spouseDln: "",
  spouseDlnState: "",
  spouseSsn: "",
  spouseBirthState: "",
  spouseBank: "",
  spouseRouting: "",
  spouseAccount: "",
  spouseDraftDate: "",
  soldPolicy1Carrier: "",
  soldPolicy1Face: "",
  soldPolicy1Pymt: "",
  soldPolicy1Beneficiary1: "",
  soldPolicy1Beneficiary1Rel: "",
  soldPolicy1Beneficiary2: "",
  soldPolicy1Beneficiary2Rel: "",
  soldPolicy2Carrier: "",
  soldPolicy2Face: "",
  soldPolicy2Pymt: "",
  soldPolicy2Beneficiary1: "",
  soldPolicy2Beneficiary1Rel: "",
  soldPolicy2Beneficiary2: "",
  soldPolicy2Beneficiary2Rel: "",
  quoteGood: "",
  quoteBetter: "",
  quoteBest: "",
  notes: "",
  otherInfo: "",
};

export const CLIENT_INTAKE_STEPS: ClientIntakeStep[] = [
  // ── Financial Inventory Script (Questions 1–16) ──
  {
    key: "_primaryName",
    scriptQuestion: 1,
    section: "Script",
    question: "Verify the legal spelling of your first and last name for me.",
    type: "text",
    placeholder: "Jane Smith",
    required: true,
  },
  {
    key: "primaryAge",
    scriptQuestion: 2,
    section: "Script",
    question: "I have that you're this age — is that still true or have you had a birthday?",
    subtitle: "Enter the age you have on file for them.",
    type: "text",
    placeholder: "45",
    required: true,
  },
  {
    key: "primaryDob",
    scriptQuestion: 3,
    section: "Script",
    question: "What is your date of birth?",
    subtitle: "mm/dd/yyyy",
    type: "tel",
    placeholder: "mm/dd/yyyy",
    required: true,
  },
  {
    key: "primarySmoker",
    scriptQuestion: 4,
    section: "Script",
    question: "Do you smoke?",
    type: "yesno",
    options: ["Yes", "No"],
    required: true,
  },
  {
    key: "primarySmokerDetails",
    scriptQuestion: 4,
    section: "Script",
    question: "How often do you smoke, like a pack a day or once in a while?",
    subtitle: "What kind of smoking do you do? (Vape, cigarettes, chew?)",
    type: "textarea",
    placeholder: "Half a pack/day, cigarettes",
    required: true,
  },
  {
    key: "_primaryHeightWeight",
    secondaryKey: "primaryWeight",
    scriptQuestion: 5,
    section: "Script",
    question: "How tall are you and how much do you weigh?",
    type: "dual",
    placeholder: "5'10\"",
    secondaryPlaceholder: "180 lbs",
    required: true,
  },
  {
    key: "primarySurgeries",
    scriptQuestion: 6,
    section: "Script",
    question: "Have you had any surgeries?",
    type: "textarea",
    placeholder: "None / list surgeries",
  },
  {
    key: "hasMedications",
    scriptQuestion: 7,
    section: "Script",
    question: "Does Doctor have you on any prescription medications?",
    type: "yesno",
    options: ["Yes", "No"],
    required: true,
  },
  {
    key: "primaryMedications",
    scriptQuestion: 7,
    section: "Script",
    question: "What have they been prescribed for?",
    subtitle:
      "You don't need the big, long drug names — just what they have been prescribed for.",
    type: "textarea",
    placeholder: "Blood pressure, cholesterol…",
    required: true,
  },
  {
    key: "primaryMedicalConditions",
    scriptQuestion: 7,
    section: "Script",
    question: "Have you had any of the following?",
    subtitle:
      "Heart attack, heart failure, congestive heart failure, coronary artery disease, A-fib, stroke, mini-strokes, cancer, stents, diabetes, neuropathy, high blood pressure, lupus, COPD, anxiety, depression, schizophrenia, dementia, bipolar pills, kidney or liver diseases, any kind of hepatitis, or any counseling for drug or alcohol abuse in the past.",
    type: "textarea",
    placeholder: "List any that apply, or write None",
  },
  {
    key: "primaryDiabetesDetails",
    scriptQuestion: 7,
    section: "Script",
    question: "Diabetes follow-up",
    subtitle:
      "Are you on pills or insulin? Gabapentin or Metformin? What was your last A1c reading? When were you diagnosed with diabetes?",
    type: "textarea",
  },
  {
    key: "primaryHeartDetails",
    scriptQuestion: 7,
    section: "Script",
    question: "Heart follow-up",
    subtitle:
      "What specifically is that doing for your heart? Any heart disease or heart attacks — anything with the heart?",
    type: "textarea",
  },
  {
    key: "primaryHbpDetails",
    scriptQuestion: 7,
    section: "Script",
    question: "High blood pressure follow-up",
    subtitle: "How many medications are you taking for that? Have you been hospitalized for HBP?",
    type: "textarea",
  },
  {
    key: "primaryDuiFelonies",
    scriptQuestion: 8,
    section: "Script",
    question:
      "Any DUI's, DWI's or felonies with your driver's license, or has your license been suspended or revoked?",
    subtitle: "How long ago?",
    type: "textarea",
    placeholder: "None / details",
  },
  {
    key: "primaryEmploymentStatus",
    scriptQuestion: 9,
    section: "Script",
    question: "Are you working or retired?",
    subtitle: "Document each source and how much from the source.",
    type: "select",
    options: ["Working", "Retired"],
    required: true,
  },
  {
    key: "primaryJob",
    scriptQuestion: 9,
    section: "Script",
    question: "What do you do for work?",
    type: "text",
    placeholder: "Occupation / employer",
    required: true,
  },
  {
    key: "primaryMonthlyIncome",
    scriptQuestion: 9,
    section: "Script",
    question: "How much is that job bringing you monthly after taxes are taken away?",
    type: "text",
    placeholder: "$4,500",
    required: true,
    variant: "working-income",
  },
  {
    key: "primaryEmploymentDetails",
    scriptQuestion: 9,
    section: "Script",
    question: "Are you receiving Social Security (SSA) or withdrawing from any retirement accounts?",
    subtitle: "Document each source and monthly amount.",
    type: "textarea",
    required: true,
  },
  {
    key: "primaryMonthlyIncome",
    scriptQuestion: 9,
    section: "Script",
    question: "What is their total monthly income from all sources?",
    subtitle: "SSA, retirement withdrawals, and any other income.",
    type: "text",
    placeholder: "$3,500",
    required: true,
    variant: "retired-income",
  },
  {
    key: "primaryDisabilityCoverage",
    scriptQuestion: 10,
    section: "Script",
    question:
      "Do you have any long and short term disability through work?",
    subtitle:
      "If yes, are they currently taking it out of your paycheck? What percentage does the plan replace (typically 60–80%)?",
    type: "textarea",
  },
  {
    key: "loanBalance",
    scriptQuestion: 11,
    section: "Script",
    question:
      "We have this amount on the loan — is this all that's owed on the home?",
    subtitle: "Are there any outstanding loan balances on any other properties they own?",
    type: "text",
    placeholder: "$250,000",
    required: true,
  },
  {
    key: "monthlyPayment",
    scriptQuestion: 12,
    section: "Script",
    question:
      "How much are they having you pay toward the home(s) monthly with insurance toward escrow and all?",
    type: "text",
    placeholder: "$1,800",
    required: true,
  },
  {
    key: "yearsLeftMortgage",
    scriptQuestion: 13,
    section: "Script",
    question: "How many more years do you have on the mortgage?",
    type: "text",
    placeholder: "22",
    required: true,
  },
  {
    key: "hasBeneficiary",
    scriptQuestion: 14,
    section: "Script",
    question:
      "When you pass away, or even if you get seriously sick and need to be taken care of, who would be helping you get back on your feet and dealing with the property when you pass away?",
    subtitle: "Do they have someone who would step in?",
    type: "yesno",
    options: ["Yes", "No"],
    required: true,
  },
  {
    key: "beneficiaryName",
    scriptQuestion: 14,
    section: "Script",
    question: "What's their name?",
    type: "text",
    required: true,
  },
  {
    key: "beneficiaryHasFamily",
    scriptQuestion: 14,
    section: "Script",
    question: "Do they have a home and family of their own?",
    type: "yesno",
    options: ["Yes", "No"],
    required: true,
  },
  {
    key: "beneficiaryPlan",
    scriptQuestion: 14,
    section: "Script",
    question: "Are they going to move into the home or sell it?",
    type: "select",
    options: ["Move in", "Sell", "Undecided"],
    required: true,
  },
  {
    key: "beneficiaryNotes",
    scriptQuestion: 14,
    section: "Script",
    question: "No beneficiary — self preservation note",
    subtitle: "If you're not paying the bills, no one else is. Capture their response.",
    type: "textarea",
  },
  {
    key: "hasCriticalIllness",
    scriptQuestion: 15,
    section: "Script",
    question:
      "Do you have any policies that will pay out if you were to become seriously sick — like Aflac, cancer, or critical illness policies?",
    type: "yesno",
    options: ["Yes", "No"],
    required: true,
  },
  {
    key: "criticalIllnessPolicies",
    scriptQuestion: 15,
    section: "Script",
    question: "How exactly does that pay out?",
    subtitle: "Usually they're for specific illnesses — document what it does and monthly amount.",
    type: "textarea",
    required: true,
  },
  {
    key: "existingCoverage",
    scriptQuestion: 16,
    section: "Script",
    question:
      "What do you already have in place that could act like life insurance?",
    subtitle:
      "Anything that would pay out to loved ones — life insurance, 401(k), 403(b), 457's, TSP's, IRA's, previous mortgage protections, annuities, or anything like that.",
    type: "textarea",
    placeholder: "Document everything they have",
  },
  {
    key: "workInsuranceNotes",
    scriptQuestion: 16,
    section: "Script",
    question: "Work insurance coverage",
    subtitle:
      "Work coverage is great, but you typically don't get to take it with you if you retire or change jobs. Note any work coverage they depend on.",
    type: "textarea",
  },
  {
    key: "policy1Carrier",
    scriptQuestion: 16,
    section: "Script",
    question: "Non-work insurance — carrier",
    subtitle: "Who is the carrier and how much are they covering you for?",
    type: "text",
  },
  {
    key: "policy1Amt",
    scriptQuestion: 16,
    section: "Script",
    question: "Non-work insurance — coverage amount",
    type: "text",
    placeholder: "$250,000",
  },
  {
    key: "policy1Exp",
    scriptQuestion: 16,
    section: "Script",
    question: "Non-work insurance — when does it expire?",
    type: "text",
  },
  {
    key: "policy1Pymt",
    scriptQuestion: 16,
    section: "Script",
    question: "Non-work insurance — how much are they charging monthly?",
    type: "text",
    placeholder: "$45",
  },
  {
    key: "policy2Carrier",
    scriptQuestion: 16,
    section: "Script",
    question: "Second non-work policy — carrier",
    type: "text",
  },
  {
    key: "policy2Amt",
    scriptQuestion: 16,
    section: "Script",
    question: "Second non-work policy — coverage amount",
    type: "text",
  },
  {
    key: "policy2Exp",
    scriptQuestion: 16,
    section: "Script",
    question: "Second non-work policy — expiration",
    type: "text",
  },
  {
    key: "policy2Pymt",
    scriptQuestion: 16,
    section: "Script",
    question: "Second non-work policy — monthly payment",
    type: "text",
  },
  {
    key: "annuity1Type",
    scriptQuestion: 16,
    section: "Script",
    question: "Retirement account — type (1)",
    subtitle: "401(k), 403(b), IRA, TSP, etc.",
    type: "text",
  },
  {
    key: "annuity1Amount",
    scriptQuestion: 16,
    section: "Script",
    question: "Retirement account — balance (1)",
    type: "text",
    placeholder: "$50,000",
  },
  {
    key: "annuity2Type",
    scriptQuestion: 16,
    section: "Script",
    question: "Retirement account — type (2)",
    type: "text",
  },
  {
    key: "annuity2Amount",
    scriptQuestion: 16,
    section: "Script",
    question: "Retirement account — balance (2)",
    type: "text",
  },
  {
    key: "annuity3Type",
    scriptQuestion: 16,
    section: "Script",
    question: "Retirement account — type (3)",
    type: "text",
  },
  {
    key: "annuity3Amount",
    scriptQuestion: 16,
    section: "Script",
    question: "Retirement account — balance (3)",
    type: "text",
  },

  // ── Pinnacle form fields (not in script — fill the actual form) ──
  {
    key: "address",
    section: "Pinnacle form",
    question: "Address",
    subtitle: "Client address for the Pinnacle form header.",
    type: "text",
    placeholder: "123 Main St, Salt Lake City, UT 84101",
    required: true,
  },
  {
    key: "dateMet",
    section: "Pinnacle form",
    question: "Date met",
    subtitle: "mm/dd/yyyy",
    type: "tel",
    placeholder: "mm/dd/yyyy",
    required: true,
  },
  {
    key: "effDate",
    section: "Pinnacle form",
    question: "Effective date",
    subtitle: "mm/dd/yyyy",
    type: "tel",
    placeholder: "mm/dd/yyyy",
  },
  {
    key: "primaryPhone",
    section: "Pinnacle form",
    question: "Phone",
    type: "tel",
    placeholder: "111-222-3333",
    required: true,
  },
  {
    key: "primaryEmail",
    section: "Pinnacle form",
    question: "Email",
    type: "text",
    placeholder: "name@email.com",
  },
  {
    key: "primaryLeftOver",
    section: "Pinnacle form",
    question: "Left over money each month",
    type: "text",
    placeholder: "$500",
  },
  {
    key: "lender",
    section: "Pinnacle form",
    question: "Lender",
    type: "text",
    placeholder: "Bank name",
  },
  {
    key: "monthsBillsSaved",
    section: "Pinnacle form",
    question: "Months of bills saved",
    type: "text",
    placeholder: "3",
  },
  {
    key: "hasSpouse",
    section: "Pinnacle form",
    question: "Is there a spouse on the Pinnacle form?",
    type: "yesno",
    options: ["Yes", "No"],
    required: true,
  },
  {
    key: "spouseFirstName",
    section: "Pinnacle form",
    question: "Spouse first name",
    type: "text",
    required: true,
  },
  {
    key: "spouseLastName",
    section: "Pinnacle form",
    question: "Spouse last name",
    type: "text",
    required: true,
  },
  {
    key: "spouseAge",
    section: "Pinnacle form",
    question: "Spouse age",
    type: "text",
    required: true,
  },
  {
    key: "spouseDob",
    section: "Pinnacle form",
    question: "Spouse date of birth",
    type: "tel",
    placeholder: "mm/dd/yyyy",
    required: true,
  },
  {
    key: "spousePhone",
    section: "Pinnacle form",
    question: "Spouse phone",
    type: "tel",
    placeholder: "111-222-3333",
  },
  {
    key: "spouseEmail",
    section: "Pinnacle form",
    question: "Spouse email",
    type: "text",
  },
  {
    key: "spouseJob",
    section: "Pinnacle form",
    question: "Spouse job",
    type: "text",
  },
  {
    key: "spouseMonthlyIncome",
    section: "Pinnacle form",
    question: "Spouse monthly income",
    type: "text",
  },
  {
    key: "spouseSmoker",
    section: "Pinnacle form",
    question: "Does spouse smoke?",
    type: "yesno",
    options: ["Yes", "No"],
  },
  {
    key: "spouseSmokerDetails",
    section: "Pinnacle form",
    question: "Spouse smoking details",
    type: "textarea",
  },
  {
    key: "spouseHeight",
    section: "Pinnacle form",
    question: "Spouse height",
    type: "text",
  },
  {
    key: "spouseWeight",
    section: "Pinnacle form",
    question: "Spouse weight",
    type: "text",
  },
  {
    key: "spouseSurgeries",
    section: "Pinnacle form",
    question: "Spouse surgeries",
    type: "textarea",
  },
  {
    key: "spouseMedicationsHealth",
    section: "Pinnacle form",
    question: "Spouse medications / health",
    type: "textarea",
  },
  {
    key: "spouseLeftOver",
    section: "Pinnacle form",
    question: "Spouse left over money",
    type: "text",
  },
  {
    key: "primaryDln",
    section: "Pinnacle form",
    question: "Driver's license number",
    type: "text",
  },
  {
    key: "primaryDlnState",
    section: "Pinnacle form",
    question: "Driver's license state",
    type: "text",
    placeholder: "UT",
  },
  {
    key: "primarySsn",
    section: "Pinnacle form",
    question: "Social Security number",
    type: "tel",
    placeholder: "111-22-3333",
  },
  {
    key: "primaryBirthState",
    section: "Pinnacle form",
    question: "Birth state",
    type: "text",
    placeholder: "UT",
  },
  {
    key: "primaryBank",
    section: "Pinnacle form",
    question: "Bank name",
    type: "text",
  },
  {
    key: "primaryRouting",
    section: "Pinnacle form",
    question: "Routing number",
    type: "tel",
  },
  {
    key: "primaryAccount",
    section: "Pinnacle form",
    question: "Account number",
    type: "tel",
  },
  {
    key: "primaryDraftDate",
    section: "Pinnacle form",
    question: "Preferred draft date",
    type: "text",
  },
  {
    key: "spouseDln",
    section: "Pinnacle form",
    question: "Spouse driver's license number",
    type: "text",
  },
  {
    key: "spouseDlnState",
    section: "Pinnacle form",
    question: "Spouse driver's license state",
    type: "text",
  },
  {
    key: "spouseSsn",
    section: "Pinnacle form",
    question: "Spouse Social Security number",
    type: "tel",
    placeholder: "111-22-3333",
  },
  {
    key: "spouseBirthState",
    section: "Pinnacle form",
    question: "Spouse birth state",
    type: "text",
  },
  {
    key: "spouseBank",
    section: "Pinnacle form",
    question: "Spouse bank name",
    type: "text",
  },
  {
    key: "spouseRouting",
    section: "Pinnacle form",
    question: "Spouse routing number",
    type: "tel",
  },
  {
    key: "spouseAccount",
    section: "Pinnacle form",
    question: "Spouse account number",
    type: "tel",
  },
  {
    key: "spouseDraftDate",
    section: "Pinnacle form",
    question: "Spouse preferred draft date",
    type: "text",
  },
  {
    key: "soldPolicy1Carrier",
    section: "Pinnacle form",
    question: "Policy sold — carrier (1)",
    type: "text",
  },
  {
    key: "soldPolicy1Face",
    section: "Pinnacle form",
    question: "Policy sold — face amount (1)",
    type: "text",
  },
  {
    key: "soldPolicy1Pymt",
    section: "Pinnacle form",
    question: "Policy sold — monthly payment (1)",
    type: "text",
  },
  {
    key: "soldPolicy1Beneficiary1",
    section: "Pinnacle form",
    question: "Policy sold — beneficiary 1 name",
    type: "text",
  },
  {
    key: "soldPolicy1Beneficiary1Rel",
    section: "Pinnacle form",
    question: "Policy sold — beneficiary 1 relationship",
    type: "text",
  },
  {
    key: "soldPolicy2Carrier",
    section: "Pinnacle form",
    question: "Policy sold — carrier (2)",
    type: "text",
  },
  {
    key: "soldPolicy2Face",
    section: "Pinnacle form",
    question: "Policy sold — face amount (2)",
    type: "text",
  },
  {
    key: "soldPolicy2Pymt",
    section: "Pinnacle form",
    question: "Policy sold — monthly payment (2)",
    type: "text",
  },
  {
    key: "soldPolicy2Beneficiary1",
    section: "Pinnacle form",
    question: "Policy sold — beneficiary 2 name",
    type: "text",
  },
  {
    key: "soldPolicy2Beneficiary1Rel",
    section: "Pinnacle form",
    question: "Policy sold — beneficiary 2 relationship",
    type: "text",
  },
  {
    key: "quoteGood",
    section: "Pinnacle form",
    question: "Good quote",
    type: "text",
  },
  {
    key: "quoteBetter",
    section: "Pinnacle form",
    question: "Better quote",
    type: "text",
  },
  {
    key: "quoteBest",
    section: "Pinnacle form",
    question: "Best quote",
    type: "text",
  },
  {
    key: "otherInfo",
    section: "Pinnacle form",
    question: "Other relevant information",
    type: "textarea",
  },
  {
    key: "notes",
    section: "Pinnacle form",
    question: "Notes",
    type: "textarea",
  },
];

const SPOUSE_FORM_KEYS = new Set<ClientIntakeFieldKey>([
  "spouseFirstName",
  "spouseLastName",
  "spouseAge",
  "spouseDob",
  "spousePhone",
  "spouseEmail",
  "spouseJob",
  "spouseMonthlyIncome",
  "spouseSmoker",
  "spouseSmokerDetails",
  "spouseHeight",
  "spouseWeight",
  "spouseSurgeries",
  "spouseMedicationsHealth",
  "spouseLeftOver",
  "spouseDln",
  "spouseDlnState",
  "spouseSsn",
  "spouseBirthState",
  "spouseBank",
  "spouseRouting",
  "spouseAccount",
  "spouseDraftDate",
]);

function mentionsAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function medicalContext(data: ClientIntakeFormData): string {
  return `${data.primaryMedicalConditions} ${data.primaryMedications}`;
}

function shouldAskDiabetesFollowUp(data: ClientIntakeFormData): boolean {
  return mentionsAny(medicalContext(data), [
    "diabetes",
    "diabetic",
    "a1c",
    "metformin",
    "insulin",
    "gabapentin",
  ]);
}

function shouldAskHeartFollowUp(data: ClientIntakeFormData): boolean {
  return mentionsAny(medicalContext(data), [
    "heart",
    "a-fib",
    "afib",
    "stroke",
    "stent",
    "coronary",
    "cardiac",
    "chf",
    "congestive",
  ]);
}

function shouldAskHbpFollowUp(data: ClientIntakeFormData): boolean {
  return mentionsAny(medicalContext(data), [
    "high blood pressure",
    "hbp",
    "hypertension",
    "blood pressure",
  ]);
}

export function getPrimaryMedicationsHealth(data: ClientIntakeFormData): string {
  return [
    data.primaryMedications,
    data.primaryMedicalConditions,
    data.primaryDiabetesDetails,
    data.primaryHeartDetails,
    data.primaryHbpDetails,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function shouldSkipIntakeStep(
  step: ClientIntakeStep,
  data: ClientIntakeFormData,
): boolean {
  if (step.key === "primarySmokerDetails" && data.primarySmoker !== "Yes") return true;
  if (step.key === "primaryMedications" && data.hasMedications !== "Yes") return true;
  if (step.key === "primaryDiabetesDetails" && !shouldAskDiabetesFollowUp(data)) return true;
  if (step.key === "primaryHeartDetails" && !shouldAskHeartFollowUp(data)) return true;
  if (step.key === "primaryHbpDetails" && !shouldAskHbpFollowUp(data)) return true;

  if (step.key === "primaryJob" && data.primaryEmploymentStatus !== "Working") return true;
  if (step.variant === "working-income" && data.primaryEmploymentStatus !== "Working") return true;
  if (step.variant === "retired-income" && data.primaryEmploymentStatus !== "Retired") return true;
  if (step.key === "primaryEmploymentDetails" && data.primaryEmploymentStatus !== "Retired") {
    return true;
  }
  if (step.key === "primaryDisabilityCoverage" && data.primaryEmploymentStatus !== "Working") {
    return true;
  }

  if (step.key === "beneficiaryName" && data.hasBeneficiary !== "Yes") return true;
  if (step.key === "beneficiaryHasFamily" && data.hasBeneficiary !== "Yes") return true;
  if (step.key === "beneficiaryPlan" && data.hasBeneficiary !== "Yes") return true;
  if (step.key === "beneficiaryNotes" && data.hasBeneficiary !== "No") return true;

  if (step.key === "criticalIllnessPolicies" && data.hasCriticalIllness !== "Yes") return true;

  if (step.key === "spouseSmokerDetails" && data.spouseSmoker !== "Yes") return true;
  if (SPOUSE_FORM_KEYS.has(step.key as ClientIntakeFieldKey) && data.hasSpouse !== "Yes") {
    return true;
  }

  return false;
}

export function getActiveIntakeSteps(data: ClientIntakeFormData): ClientIntakeStep[] {
  return CLIENT_INTAKE_STEPS.filter((step) => !shouldSkipIntakeStep(step, data));
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatSsn(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function isValidPhone(phone: string): boolean {
  return /^\d{3}-\d{3}-\d{4}$/.test(phone);
}

export function isValidSsn(ssn: string): boolean {
  return /^\d{3}-\d{2}-\d{4}$/.test(ssn);
}

export function isValidDate(value: string): boolean {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseDisplayDate(value: string): string | null {
  if (!value.trim()) return null;
  if (!isValidDate(value)) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

export function getStepValue(step: ClientIntakeStep, data: ClientIntakeFormData): string {
  if (step.key === "_primaryName") {
    return `${data.primaryFirstName} ${data.primaryLastName}`.trim();
  }
  if (step.key === "_primaryHeightWeight") {
    return data.primaryHeight;
  }
  return data[step.key as ClientIntakeFieldKey] ?? "";
}

export function getSecondaryStepValue(step: ClientIntakeStep, data: ClientIntakeFormData): string {
  if (step.key === "_primaryHeightWeight" && step.secondaryKey) {
    return data[step.secondaryKey] ?? "";
  }
  return "";
}

export function setStepValue(
  step: ClientIntakeStep,
  raw: string,
  data: ClientIntakeFormData,
): ClientIntakeFormData {
  if (step.key === "_primaryName") {
    const parts = raw.trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");
    return { ...data, primaryFirstName: firstName, primaryLastName: lastName };
  }

  let value = raw;
  if (step.key === "primaryPhone" || step.key === "spousePhone") value = formatPhone(raw);
  if (step.key === "primarySsn" || step.key === "spouseSsn") value = formatSsn(raw);
  if (
    step.key === "primaryDob"
    || step.key === "spouseDob"
    || step.key === "dateMet"
    || step.key === "effDate"
  ) {
    value = formatDateInput(raw);
  }

  if (step.key === "_primaryHeightWeight") {
    return { ...data, primaryHeight: raw };
  }

  return { ...data, [step.key]: value };
}

export function setSecondaryStepValue(
  step: ClientIntakeStep,
  raw: string,
  data: ClientIntakeFormData,
): ClientIntakeFormData {
  if (step.key === "_primaryHeightWeight" && step.secondaryKey) {
    return { ...data, [step.secondaryKey]: raw };
  }
  return data;
}

export function validateIntakeStep(step: ClientIntakeStep, data: ClientIntakeFormData): string | null {
  const value = getStepValue(step, data);
  const secondaryValue = getSecondaryStepValue(step, data);

  if (step.type === "dual" && step.required) {
    if (!value.trim() || !secondaryValue.trim()) {
      return "Please enter both height and weight.";
    }
  }

  if (step.required && step.type !== "dual" && !value.trim()) {
    return "This field is required.";
  }

  if (step.key === "_primaryName" && value.trim() && !data.primaryLastName.trim()) {
    return "Please enter first and last name.";
  }

  if ((step.key === "primaryPhone" || step.key === "spousePhone") && value && !isValidPhone(value)) {
    return "Please use the format 111-222-3333.";
  }

  if ((step.key === "primarySsn" || step.key === "spouseSsn") && value && !isValidSsn(value)) {
    return "Please use the format 111-22-3333.";
  }

  if (
    (step.key === "primaryDob" || step.key === "spouseDob" || step.key === "dateMet")
    && value
    && !isValidDate(value)
  ) {
    return "Please use mm/dd/yyyy format.";
  }

  if (step.key === "effDate" && value && !isValidDate(value)) {
    return "Please use mm/dd/yyyy format.";
  }

  return null;
}

export function maskSsn(ssn: string): string {
  const match = ssn.match(/^\d{3}-\d{2}-(\d{4})$/);
  if (!match) return ssn || "—";
  return `•••-••-${match[1]}`;
}

export function formatReviewValue(step: ClientIntakeStep, data: ClientIntakeFormData): string {
  if (step.key === "_primaryHeightWeight") {
    const height = data.primaryHeight.trim();
    const weight = data.primaryWeight.trim();
    if (!height && !weight) return "—";
    return `H: ${height || "—"} · W: ${weight || "—"}`;
  }

  const value = getStepValue(step, data);
  if (!value.trim()) return "—";
  if (step.key === "primarySsn" || step.key === "spouseSsn") return maskSsn(value);
  if (step.key === "primaryAccount" || step.key === "spouseAccount") {
    const digits = value.replace(/\D/g, "");
    if (digits.length > 4) return `••••${digits.slice(-4)}`;
  }
  return value;
}

export function getClientDisplayName(data: ClientIntakeFormData): string {
  return `${data.primaryFirstName} ${data.primaryLastName}`.trim() || "Client";
}

function mapPortalClient(row: Record<string, unknown>): PortalClientRecord {
  return {
    id: String(row.id),
    agent_user_id: String(row.agent_user_id),
    primary_first_name: String(row.primary_first_name ?? ""),
    primary_last_name: String(row.primary_last_name ?? ""),
    primary_phone: (row.primary_phone as string | null) ?? null,
    primary_email: (row.primary_email as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    date_met: (row.date_met as string | null) ?? null,
    form_data: (row.form_data as ClientIntakeFormData) ?? EMPTY_CLIENT_INTAKE,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listPortalClients(userId: string): Promise<PortalClientRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_clients")
    .select("*")
    .eq("agent_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapPortalClient);
}

export async function getPortalClient(userId: string, clientId: string): Promise<PortalClientRecord | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_clients")
    .select("*")
    .eq("id", clientId)
    .eq("agent_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPortalClient(data) : null;
}

export async function submitPortalClient(
  userId: string,
  formData: ClientIntakeFormData,
): Promise<PortalClientRecord> {
  const supabase = getSupabaseClient();
  const payload = {
    agent_user_id: userId,
    primary_first_name: formData.primaryFirstName.trim(),
    primary_last_name: formData.primaryLastName.trim(),
    primary_phone: formData.primaryPhone.trim() || null,
    primary_email: formData.primaryEmail.trim() || null,
    address: formData.address.trim() || null,
    date_met: parseDisplayDate(formData.dateMet),
    form_data: formData,
  };

  const { data, error } = await supabase
    .from("portal_clients")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return mapPortalClient(data);
}

export function clientRecordToFormData(record: PortalClientRecord): ClientIntakeFormData {
  return { ...EMPTY_CLIENT_INTAKE, ...record.form_data };
}

export function isSpouseSection(step: ClientIntakeStep): boolean {
  return step.section === "Pinnacle form" && step.key.startsWith("spouse");
}

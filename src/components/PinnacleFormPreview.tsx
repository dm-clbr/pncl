import type { ClientIntakeFormData } from "@/lib/client-intake";
import { getClientDisplayName, getPrimaryMedicationsHealth, maskSsn } from "@/lib/client-intake";
import "@/styles/client-intake.css";

interface PinnacleFormPreviewProps {
  data: ClientIntakeFormData;
  compact?: boolean;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="pinnacle-field">
      <span className="pinnacle-field-label">{label}</span>
      <span className="pinnacle-field-value">{value || "\u00a0"}</span>
    </div>
  );
}

function PersonBlock({
  title,
  data,
  prefix,
  showBanking,
}: {
  title: string;
  data: ClientIntakeFormData;
  prefix: "primary" | "spouse";
  showBanking: boolean;
}) {
  const isPrimary = prefix === "primary";
  const name = isPrimary
    ? getClientDisplayName(data)
    : `${data.spouseFirstName} ${data.spouseLastName}`.trim();
  const smoker = isPrimary ? data.primarySmoker : data.spouseSmoker;
  const smokerDetails = isPrimary ? data.primarySmokerDetails : data.spouseSmokerDetails;
  const smokerLine = smoker === "Yes"
    ? `Yes — ${smokerDetails || "details not provided"}`
    : smoker || "No";

  return (
    <section className="pinnacle-person-block">
      <h3>{title}</h3>
      <div className="pinnacle-grid-2">
        <Field label="Name" value={name} />
        <Field label="Age" value={isPrimary ? data.primaryAge : data.spouseAge} />
        <Field label="Phone" value={isPrimary ? data.primaryPhone : data.spousePhone} />
        <Field label="Email" value={isPrimary ? data.primaryEmail : data.spouseEmail} />
        <Field label="Job" value={isPrimary ? data.primaryJob : data.spouseJob} />
        <Field label="DOB" value={isPrimary ? data.primaryDob : data.spouseDob} />
        <Field label="Monthly Income" value={isPrimary ? data.primaryMonthlyIncome : data.spouseMonthlyIncome} />
        <Field label="Smoker" value={smokerLine} />
        <Field label="Height" value={isPrimary ? data.primaryHeight : data.spouseHeight} />
        <Field label="Weight" value={isPrimary ? data.primaryWeight : data.spouseWeight} />
      </div>
      <Field
        label="Surgeries"
        value={isPrimary ? data.primarySurgeries : data.spouseSurgeries}
      />
      <Field
        label="Medications / Health"
        value={isPrimary ? getPrimaryMedicationsHealth(data) : data.spouseMedicationsHealth}
      />
      <Field label="Left over $" value={isPrimary ? data.primaryLeftOver : data.spouseLeftOver} />

      {showBanking && (
        <div className="pinnacle-banking">
          <h4>Banking & ID</h4>
          <div className="pinnacle-grid-2">
            <Field label="DLN" value={isPrimary ? data.primaryDln : data.spouseDln} />
            <Field label="State" value={isPrimary ? data.primaryDlnState : data.spouseDlnState} />
            <Field
              label="SSN"
              value={maskSsn(isPrimary ? data.primarySsn : data.spouseSsn)}
            />
            <Field label="Birth State" value={isPrimary ? data.primaryBirthState : data.spouseBirthState} />
            <Field label="Bank" value={isPrimary ? data.primaryBank : data.spouseBank} />
            <Field label="Routing" value={isPrimary ? data.primaryRouting : data.spouseRouting} />
            <Field label="Account" value={isPrimary ? data.primaryAccount : data.spouseAccount} />
            <Field label="Draft Date" value={isPrimary ? data.primaryDraftDate : data.spouseDraftDate} />
          </div>
        </div>
      )}
    </section>
  );
}

export default function PinnacleFormPreview({ data, compact }: PinnacleFormPreviewProps) {
  return (
    <div className={`pinnacle-form-preview${compact ? " compact" : ""}`}>
      <header className="pinnacle-form-header">
        <div className="pinnacle-form-meta">
          <Field label="Address" value={data.address} />
          <Field label="Date Met" value={data.dateMet} />
          <Field label="Eff Date" value={data.effDate} />
        </div>
      </header>

      <div className="pinnacle-form-columns">
        <PersonBlock title="Primary client" data={data} prefix="primary" showBanking />
        {data.hasSpouse === "Yes" && (
          <PersonBlock title="Spouse" data={data} prefix="spouse" showBanking />
        )}
      </div>

      <section className="pinnacle-section">
        <h3>Financials</h3>
        <div className="pinnacle-grid-2">
          <Field label="Loan Balance" value={data.loanBalance} />
          <Field label="Monthly Payment" value={data.monthlyPayment} />
          <Field label="Lender" value={data.lender} />
          <Field label="Months of Bills Saved" value={data.monthsBillsSaved} />
          <Field label="Years Left on Mortgage" value={data.yearsLeftMortgage} />
        </div>
      </section>

      <section className="pinnacle-section">
        <h3>Annuity opportunities</h3>
        <div className="pinnacle-grid-3">
          <Field label="Acct Type" value={data.annuity1Type} />
          <Field label="Amount" value={data.annuity1Amount} />
          <span />
          <Field label="Acct Type" value={data.annuity2Type} />
          <Field label="Amount" value={data.annuity2Amount} />
          <span />
          <Field label="Acct Type" value={data.annuity3Type} />
          <Field label="Amount" value={data.annuity3Amount} />
        </div>
      </section>

      <section className="pinnacle-section">
        <h3>Current policies</h3>
        <div className="pinnacle-grid-2">
          <Field label="Carrier" value={data.policy1Carrier} />
          <Field label="Exp" value={data.policy1Exp} />
          <Field label="Amt" value={data.policy1Amt} />
          <Field label="Pymt" value={data.policy1Pymt} />
          <Field label="Carrier" value={data.policy2Carrier} />
          <Field label="Exp" value={data.policy2Exp} />
          <Field label="Amt" value={data.policy2Amt} />
          <Field label="Pymt" value={data.policy2Pymt} />
        </div>
      </section>

      <section className="pinnacle-section">
        <h3>Beneficiary</h3>
        <div className="pinnacle-grid-2">
          <Field label="Name" value={data.beneficiaryName} />
          <Field label="Has home & family" value={data.beneficiaryHasFamily} />
          <Field label="Plan" value={data.beneficiaryPlan} />
        </div>
        <Field label="Notes" value={data.beneficiaryNotes} />
      </section>

      <section className="pinnacle-section">
        <h3>Coverage notes</h3>
        <Field
          label="Critical illness"
          value={
            data.hasCriticalIllness === "Yes"
              ? data.criticalIllnessPolicies
              : data.hasCriticalIllness || "No"
          }
        />
        <Field label="Existing coverage" value={data.existingCoverage} />
        <Field label="Work insurance notes" value={data.workInsuranceNotes} />
        <Field label="Retired income / SSA" value={data.primaryEmploymentDetails} />
        <Field label="Disability coverage" value={data.primaryDisabilityCoverage} />
        <Field label="Driving record" value={data.primaryDuiFelonies} />
      </section>

      <section className="pinnacle-section">
        <h3>Policy sold</h3>
        <div className="pinnacle-grid-2">
          <Field label="Carrier" value={data.soldPolicy1Carrier} />
          <Field label="Face Amt" value={data.soldPolicy1Face} />
          <Field label="Monthly Pymt" value={data.soldPolicy1Pymt} />
          <Field
            label="Beneficiary"
            value={`${data.soldPolicy1Beneficiary1} (${data.soldPolicy1Beneficiary1Rel})`.trim()}
          />
        </div>
        {(data.soldPolicy2Carrier || data.soldPolicy2Face) && (
          <div className="pinnacle-grid-2">
            <Field label="Carrier" value={data.soldPolicy2Carrier} />
            <Field label="Face Amt" value={data.soldPolicy2Face} />
            <Field label="Monthly Pymt" value={data.soldPolicy2Pymt} />
            <Field
              label="Beneficiary"
              value={`${data.soldPolicy2Beneficiary1} (${data.soldPolicy2Beneficiary1Rel})`.trim()}
            />
          </div>
        )}
      </section>

      <section className="pinnacle-section">
        <h3>Quotes</h3>
        <div className="pinnacle-grid-3">
          <Field label="Good" value={data.quoteGood} />
          <Field label="Better" value={data.quoteBetter} />
          <Field label="Best" value={data.quoteBest} />
        </div>
      </section>

      <section className="pinnacle-section">
        <h3>Other</h3>
        <Field label="Other relevant information" value={data.otherInfo} />
        <Field label="Notes" value={data.notes} />
      </section>
    </div>
  );
}

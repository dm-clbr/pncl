export default function OtherImoFields({ name, carriers, onChange, disabled = false }: {
  name: string; carriers: string; disabled?: boolean;
  onChange: (field: "otherImoName" | "otherImoCarriers", value: string) => void;
}) {
  return <div className="onboarding-imo-details">
    <p className="lead">Tell us where you’re contracted so our team can prepare your carrier transfers.</p>
    <div className="onboarding-field"><label htmlFor="other-imo-name">IMO name</label>
      <input id="other-imo-name" value={name} maxLength={200} required disabled={disabled}
        autoComplete="off" placeholder="Enter your current IMO’s name" onChange={(event) => onChange("otherImoName", event.target.value)} />
    </div>
    <div className="onboarding-field"><label htmlFor="other-imo-carriers">Carriers you’re contracted with</label>
      <textarea id="other-imo-carriers" value={carriers} maxLength={8050} rows={4} required disabled={disabled}
        aria-describedby="other-imo-carriers-help" placeholder="For example: Mutual of Omaha, Foresters" onChange={(event) => onChange("otherImoCarriers", event.target.value)} />
      <p id="other-imo-carriers-help" className="onboarding-help-text">Separate carrier names with commas or put one on each line.</p>
    </div>
  </div>;
}

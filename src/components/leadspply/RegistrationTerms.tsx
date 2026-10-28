// Registration documents copied verbatim from LeadSpply ea59984f on 2026-10-27.
// This checkbox does not replace the separate post-approval TCPA attestation.
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
const Section = (
  { title, children }: { title: string; children: ReactNode },
) => (
  <section>
    <h3>{title}</h3>
    {children}
  </section>
);
export default function RegistrationTerms() {
  return (
    <div className="hub-setup-terms">
      <details>
        <summary>Read LeadSpply Terms and Conditions (June 10, 2026)</summary>
        {" "}
        <div className="prose prose-sm text-graphite space-y-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          <Section title="1. Agreement Between User and leadspply.com">
            <p>
              Welcome to leadspply.com. The leadspply.com website (the "Site")
              is operated by Leads Spply LLC. leadspply.com is offered to you on
              the condition of your acceptance of the terms, conditions, and
              notices outlined herein (the "Terms"). Your use of leadspply.com
              constitutes your agreement to all such Terms. Please read these
              Terms carefully and keep a copy for your reference.
            </p>
            <p>
              leadspply.com is an e-commerce platform that provides insurance
              sales leads and related software services to licensed insurance
              professionals and their teams.
            </p>
          </Section>

          <Section title="2. Privacy">
            <p>
              Your use of leadspply.com is subject to Leads Spply LLC's{" "}
              <Link
                to="https://leadspply.com/privacy"
                className="text-olive underline"
              >
                Privacy Policy
              </Link>. Please review the Privacy Policy, which also governs the
              Site and informs users of our data collection practices.
            </p>
          </Section>

          <Section title="3. Electronic Communications">
            <p>
              By visiting leadspply.com or sending emails to Leads Spply LLC,
              you consent to receive electronic communications. You agree that
              all agreements, notices, disclosures, and other communications
              provided electronically via email or on the Site satisfy any legal
              requirement that such communications be in writing.
            </p>
          </Section>

          <Section title="4. Children Under Thirteen">
            <p>
              Leads Spply LLC does not knowingly collect personal information
              from persons under the age of 13. If you are under 18, you may use
              leadspply.com only with the permission of a parent or guardian.
            </p>
          </Section>

          <Section title="5. Platform Use, Leads, and Licensing">
            <p>
              By registering as an agent, you agree to use purchased leads only
              in states where you hold an active insurance license, or under the
              direct supervision of a licensed agent where permitted by law. You
              agree not to share, resell, or redistribute lead contact
              information outside your registered team.
            </p>
            <p>
              <strong>All lead purchases are final and non-refundable.</strong>
              {" "}
              Because of the nature of lead data and sales, once a lead is
              purchased it is yours to keep and work — we do not issue refunds,
              credits, or returns after a sale is completed. Leads are sold
              as-is; a purchase reflects access to the contact record, not a
              guarantee of any outcome, contact, or sale.
            </p>
            <p>
              Leads Spply LLC reserves the right to suspend or terminate
              accounts that violate these Terms, applicable insurance
              regulations, or communications compliance requirements.
            </p>
          </Section>

          <Section title="6. Links to Third-Party Sites / Third-Party Services">
            <p>
              leadspply.com may contain links to third-party websites ("Linked
              Sites"). These Linked Sites are not under the control of Leads
              Spply LLC, and Leads Spply LLC is not responsible for the content,
              updates, or security of any Linked Site. The inclusion of any
              Linked Site does not imply an endorsement by Leads Spply LLC.
            </p>
            <p>
              Certain services available on leadspply.com may be provided by
              third-party organizations. By using any product or service on
              leadspply.com, you consent to Leads Spply LLC sharing necessary
              data with third parties to fulfill service requests.
            </p>
          </Section>

          <Section title="7. No Unlawful or Prohibited Use / Intellectual Property">
            <p>
              You are granted a non-exclusive, non-transferable, revocable
              license to access and use leadspply.com strictly in accordance
              with these Terms.
            </p>
            <p>You agree that you will NOT:</p>
            <ul>
              <li>Use the Site for any unlawful or prohibited purpose</li>
              <li>
                Damage, disable, or impair the Site or interfere with another
                user's experience
              </li>
              <li>
                Attempt to obtain unauthorized materials or information through
                hacking or scraping
              </li>
            </ul>
            <p>
              All content on the Site—including text, graphics, logos, and
              software—is the property of Leads Spply LLC or its suppliers and
              is protected by copyright and other intellectual property laws.
            </p>
            <p>You may not:</p>
            <ul>
              <li>Modify, publish, or distribute Site content</li>
              <li>Reverse-engineer or resell Site content</li>
              <li>Remove copyright or proprietary notices</li>
            </ul>
            <p>
              Your use of the Site does not entitle you to any ownership rights
              in protected content.
            </p>
          </Section>

          <Section title="8. International Users">
            <p>
              The Site is operated from the USA. If you access leadspply.com
              from outside the USA, you are responsible for complying with local
              laws. You may not use the Site in a manner that violates
              applicable international laws or regulations.
            </p>
          </Section>

          <Section title="9. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless Leads Spply LLC,
              its officers, directors, employees, and third parties from any
              losses, costs, liabilities, and expenses (including attorney fees)
              related to:
            </p>
            <ul>
              <li>Your use of the Site</li>
              <li>Any content you submit</li>
              <li>Your violation of these Terms</li>
              <li>Your infringement of third-party rights</li>
            </ul>
          </Section>

          <Section title="10. Arbitration">
            <p>
              If a dispute arises regarding these Terms, both parties agree to
              binding arbitration under the Federal Arbitration Act. Arbitration
              will be conducted by the American Arbitration Association or
              another mutually agreed arbitration service. The arbitrator's
              decision will be final, and judgment may be entered in any court
              with jurisdiction. The prevailing party may recover legal costs
              and attorney fees.
            </p>
          </Section>

          <Section title="11. Class Action Waiver">
            <p>
              All disputes must be resolved individually. Class actions,
              collective actions, and representative lawsuits are not permitted.
            </p>
            <p>You agree that:</p>
            <ul>
              <li>You may only bring claims in an individual capacity</li>
              <li>You may not participate in any class action lawsuit</li>
              <li>The arbitrator cannot preside over a class action case</li>
            </ul>
          </Section>

          <Section title="12. Liability Disclaimer">
            <p>THE SITE AND ITS CONTENT ARE PROVIDED "AS IS."</p>
            <p>Leads Spply LLC makes no warranties regarding:</p>
            <ul>
              <li>The accuracy, reliability, or availability of the Site</li>
              <li>The suitability of the Site for any purpose</li>
            </ul>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEADS SPPLY LLC DISCLAIMS
              ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY
              AND FITNESS FOR A PARTICULAR PURPOSE.
            </p>
            <p>
              LIMITATION OF LIABILITY: Leads Spply LLC and its suppliers are not
              liable for direct, indirect, punitive, incidental, special, or
              consequential damages, including:
            </p>
            <ul>
              <li>Loss of use, data, or profits</li>
              <li>Inability to access or use the Site</li>
              <li>Unauthorized access or data breaches</li>
            </ul>
            <p>
              Some jurisdictions do not allow liability exclusions, so these
              limitations may not apply to you. If you are dissatisfied with the
              Site, your sole remedy is to stop using it.
            </p>
          </Section>

          <Section title="13. Termination / Access Restriction">
            <p>
              Leads Spply LLC reserves the right to terminate or restrict access
              to the Site without notice at its sole discretion.
            </p>
            <p>
              Governing Law: These Terms are governed by Utah law. You consent
              to jurisdiction in Utah courts.
            </p>
            <p>You acknowledge that this Agreement does not create any:</p>
            <ul>
              <li>Joint venture</li>
              <li>Partnership</li>
              <li>Employment relationship</li>
            </ul>
            <p>
              If any provision of these Terms is found invalid or unenforceable,
              the remaining provisions will still apply.
            </p>
          </Section>

          <Section title="14. Changes to Terms">
            <p>
              Leads Spply LLC reserves the right to modify these Terms at any
              time. The most current version will supersede all previous
              versions. Users are encouraged to periodically review these Terms
              to stay informed of updates.
            </p>
          </Section>

          <Section title="15. SMS, Phone, and Marketing Communications">
            <p>
              By providing your phone number and/or email address to Leads Spply
              LLC (including through website forms, account creation, or service
              inquiries), you consent to receive communications from the Company
              via:
            </p>
            <ul>
              <li>Text messages (SMS/MMS)</li>
              <li>
                Phone calls (including via auto-dialer, prerecorded voice, or
                live agent)
              </li>
              <li>Email (transactional, service-related, and promotional)</li>
            </ul>
            <p>These communications may include:</p>
            <ul>
              <li>Service notifications and account updates</li>
              <li>Appointment and billing alerts</li>
              <li>Marketing promotions and offers</li>
              <li>Customer service follow-ups</li>
              <li>Requests for feedback or surveys</li>
            </ul>
            <p>
              Message frequency may vary. Message and data rates may apply.
              Consent is not a condition of purchase.
            </p>
            <p>You may opt out of marketing communications at any time:</p>
            <ul>
              <li>SMS: Reply "STOP" to any message</li>
              <li>
                Email: Click the "Unsubscribe" link in the footer of any
                marketing email
              </li>
              <li>
                Phone: Notify the agent or contact us at support@leadspply.com
              </li>
            </ul>
            <p>
              Even after opting out of marketing messages, you may still receive
              transactional or account-related messages as permitted by law.
            </p>
            <p>
              All contact information and communication records are stored
              securely and handled in accordance with our Privacy Policy. By
              agreeing to these Terms, you also acknowledge and accept the
              practices described in the Privacy Policy, including how we
              collect, use, and share your information.
            </p>
            <p>Our communications practices comply with:</p>
            <ul>
              <li>Telephone Consumer Protection Act (TCPA)</li>
              <li>CTIA Messaging Principles and Best Practices</li>
              <li>
                The Campaign Registry (TCR) requirements for A2P 10DLC
                registration
              </li>
              <li>
                Applicable U.S. federal and state consumer protection laws
              </li>
            </ul>
          </Section>

          <Section title="16. SMS Program Terms (leadspply Alerts)">
            <p>
              You may opt in to receive text messages from leadspply for account
              and service purposes and, if you choose, for occasional
              promotions.
            </p>
            <p>
              <strong>Program Description (Service/Care).</strong>{" "}
              You will receive account and service-related messages, including
              lead notifications, appointment reminders, service updates, and
              account notifications.
            </p>
            <p>
              <strong>If you also opt in to marketing.</strong>{" "}
              You may receive occasional promotional messages about offers,
              discounts, and news. Consent to receive marketing is not a
              condition of purchase.
            </p>
            <p>
              <strong>STOP.</strong>{" "}
              You can cancel the SMS service at any time by replying "STOP" to
              any message you receive from us. After you send "STOP," we will
              confirm your unsubscribe status by SMS. You will no longer receive
              SMS messages from us. To rejoin, submit the opt-in form again and
              we will resume messaging.
            </p>
            <p>
              <strong>HELP.</strong>{" "}
              If you experience issues with the messaging program, reply "HELP"
              for assistance or contact us at support@leadspply.com.
            </p>
            <p>
              <strong>Carrier disclosure.</strong>{" "}
              Carriers are not liable for delayed or undelivered messages.
            </p>
            <p>
              <strong>Rates &amp; frequency.</strong>{" "}
              Message and data rates may apply. Message frequency varies.
            </p>
            <p>
              <strong>Privacy.</strong>{" "}
              For privacy-related inquiries, please see our{" "}
              <Link
                to="https://leadspply.com/privacy"
                className="text-olive underline"
              >
                Privacy Policy
              </Link>.
            </p>
          </Section>

          <Section title="17. Contact Information">
            <p>
              For questions or concerns regarding these Terms, contact us at:
            </p>
            <p>
              Leads Spply LLC
              <br />
              1261 S. 820 E. Suite #300
              <br />
              American Fork, Utah 84003
              <br />
              Email:{" "}
              <a
                href="mailto:support@leadspply.com"
                className="text-olive underline"
              >
                support@leadspply.com
              </a>
            </p>
          </Section>
        </div>
      </details>
      <details>
        <summary>Read LeadSpply Agent Agreement</summary>{" "}
        <div className="prose prose-sm text-graphite space-y-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-2">
              Terms &amp; Conditions
            </h2>
            <p className="font-semibold">
              PLEASE READ THIS USER AGREEMENT AND ALL OTHER AGREEMENTS AND
              POLICIES REFERENCED HEREIN, COLLECTIVELY DEFINED BELOW AS THE
              &quot;TERMS AND CONDITIONS,&quot; CAREFULLY, AS THEY CONTAIN
              IMPORTANT INFORMATION REGARDING YOUR LEGAL RIGHTS, REMEDIES, AND
              OBLIGATIONS. THESE INCLUDE VARIOUS LIMITATIONS AND EXCLUSIONS.
            </p>
            <p>
              This User Agreement (this &quot;Agreement&quot;) is a contract
              between you (&quot;you&quot; or &quot;User&quot;) and Leads Spply
              LLC, doing business as leadspply (&quot;leadspply,&quot;
              &quot;we,&quot; or &quot;us&quot;). To the extent expressly
              stated, you must read, agree to, and accept all of the terms and
              conditions contained in this Agreement to be a User of our website
              (leadspply.com), with its principal office located at 1261 S. 820
              E. Suite #300, American Fork, Utah 84003. You (the website
              &quot;user&quot;) understand and recognize that leadspply.com is
              not a party to any agreement, contract, or contractual relations,
              of any nature, entered into between the users of its website. YOU
              UNDERSTAND THAT BY USING THE SITE AFTER THE EFFECTIVE DATE, YOU
              AGREE TO BE BOUND BY THE TERMS AND CONDITIONS. IF YOU DO NOT
              ACCEPT THE TERMS AND CONDITIONS IN THEIR ENTIRETY, YOU MUST NOT
              ACCESS OR USE THE SITE AFTER THE EFFECTIVE DATE EXCEPT AS
              PERMITTED BY THE SITE TERMS OF USE.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              About Us (leadspply.com)
            </h2>
            <p>
              leadspply is a lead marketplace and sales platform built for
              licensed insurance professionals and their teams. Our mission is
              to make the agents we serve our number one priority by delivering
              quality, compliance-minded leads and the software tools agents
              need to grow — from lead purchasing and assignment to dialing,
              follow-up, and reporting. Trust and loyalty are not given; they
              are earned, and we work to earn them with every agent on the
              platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Definitions
            </h2>
            <ul>
              <li>
                &quot;leadspply,&quot; &quot;we,&quot; or &quot;us&quot; means
                Leads Spply LLC and the leadspply.com platform.
              </li>
              <li>&quot;T&amp;Cs&quot; means these Terms and Conditions.</li>
              <li>
                &quot;Services&quot; means all services delivered by the
                leadspply.com website.
              </li>
              <li>
                &quot;Website&quot; means the website accessible at
                leadspply.com.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">Scope</h2>
            <p>
              These Terms are intended to supplement and not to replace any
              existing agreements between you and leadspply regarding services
              offered. Your use of the Website is at the user&rsquo;s discretion
              and sole risk. leadspply is not responsible for any harm that may
              result or arise out of use of the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">Ownership</h2>
            <p>
              All rights to this Website, the content and information herein,
              and other services and materials made available on this Website —
              including software applications, copyright information, and
              proprietary notices that may be provided (collectively the
              &quot;Materials&quot;) — are proprietary to leadspply, its
              subsidiaries, or third parties from which leadspply has obtained
              permission, and are protected by worldwide copyright laws as well
              as other intellectual property laws. All rights not expressly
              granted under these Terms and Conditions are retained by leadspply
              and such third parties or subsidiaries. You also acknowledge that
              the leadspply Website contains certain content, including but not
              limited to graphics, text, audio, video, code, and photographs,
              and any information or data relating to such content, that is
              protected by trademarks, copyrights, trade secrets, or other
              proprietary rights, and that such rights are valid and protected
              in all media and technologies presently existing or developed
              hereafter. You may not in any way modify, delete, remove, augment,
              add to, transmit, publish, participate in the transfer or sale of,
              create derivative works from, or in any way exploit any of such
              content, in whole or in part. If no specific restrictions are
              displayed, Users may make copies of select portions of the
              content, provided that the copies are made only for the
              User&rsquo;s personal use and that the User maintains any notices
              contained in the content, such as copyright notices, trademark
              legends, or other proprietary rights notices. Except as provided
              in the preceding sentence or as permitted by the fair use
              privilege under U.S. copyright law, Users may not upload, post,
              reproduce, or distribute in any way content protected by copyright
              or other proprietary right without obtaining permission of the
              owner. In addition to the foregoing, use of any software content
              shall be governed by these Terms and any software license
              agreement accompanying such software.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              License to Use Website
            </h2>
            <p>
              Bound by this Agreement, you agree to abide by the access granted
              in exploring and accessing information from this Website. Unless
              otherwise stated, leadspply owns the intellectual property rights
              in this Website and the Services provided on it. Subject to the
              license below, all intellectual property rights are reserved. You
              may download or print to a single computer for your non-commercial
              internal use only, unless specifically licensed to do otherwise by
              leadspply in writing or as allowed by any license terms
              accompanying individual Materials. You have permission to download
              the contents of this Website to your local hard drive for your
              personal use. You also have permission to copy the content to an
              individual third party for their personal use, provided that you
              acknowledge the source of the material as being this Website and
              you inform the third party that they are bound by
              leadspply&rsquo;s Terms and Conditions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Termination of This License
            </h2>
            <p>
              In the event that you violate any of these Terms and Conditions,
              your authorization to use this Website shall be automatically
              terminated, and you must immediately discontinue your use of the
              Website and destroy any downloaded or printed Materials obtained
              from the Website, including any material shared with any third
              party obtained from this Website.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Obligations and Conduct When Using the Site
            </h2>
            <p>
              This Website contains proprietary notices and copyright
              information, and by consenting to use this Website, you agree to
              observe and abide by them. By using this Website, you assume full
              responsibility for the protection of your computer system,
              including but not limited to your computer software and hardware
              and stored data, as well as any third parties who may access or be
              otherwise connected to your computer systems. You will assume
              responsibility for ensuring that programs or other data downloaded
              or otherwise received from this Website are free from viruses,
              worms, Trojan horses, or other items of a destructive nature. By
              using this Website, you agree not to attempt to publish, send, or
              upload malicious content onto the Website with the intention of
              disrupting the Website or compromising its functionality.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Data Security Policy
            </h2>
            <p>
              leadspply will take appropriate and reasonable measures to ensure
              that data transported electronically to us through the Website or
              otherwise, and stored by leadspply or otherwise, is not accessed
              by an unauthorized third party. You accept the risk that data
              transmitted electronically to leadspply via this Website or
              otherwise may be intercepted before reaching leadspply, or
              accessed from leadspply&rsquo;s data storage by third parties
              unauthorized by leadspply, and may be exploited unlawfully by such
              unauthorized third parties. leadspply does not assume
              responsibility for guarding against the access of such
              unauthorized third parties. We do not store credit or debit card
              details on our site.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Viruses and Other Computer Misuse
            </h2>
            <p>
              leadspply does not guarantee that our Website shall be entirely
              free or secure from bugs, viruses, or other malicious content. You
              are responsible for configuring your computer programs, devices,
              information technology, and platform to access our site, and you
              are advised to always use your own virus protection software. You
              also agree not to misuse our Website by knowingly introducing
              viruses, Trojans, worms, logic bombs, or other material that is
              malicious or technologically harmful. You must not attempt to gain
              unauthorized access to our site, the server on which our site is
              stored, or any server, computer, or database connected to our
              site. You must not attack our site via a denial-of-service attack
              or a distributed denial-of-service attack. By breaching this
              provision, you may be committing a criminal offense under the
              Computer Fraud and Abuse Act (CFAA) and other applicable U.S.
              federal and state law. We will report any such breach to the
              relevant law enforcement authorities, and we will cooperate with
              those authorities by disclosing your identity to them. In the
              event of such a breach, your right to use our site will cease
              immediately.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Operation, Availability, and Functionalities of the Website
            </h2>
            <p>
              leadspply shall try, as far as possible, to keep the Website
              accessible 7 days a week and 24 hours a day. Nevertheless, access
              to the Website may be temporarily suspended, without notice, owing
              to technical maintenance, migration or update operations, or
              outages or constraints linked to the operation of the network.
              Furthermore, leadspply reserves the right to modify or suspend all
              or part of access to the Website or its functionalities, at its
              sole discretion, temporarily or permanently.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              TCPA &amp; Communications Compliance — Assumption of Risk
            </h2>
            <p>
              You acknowledge and agree that you are solely responsible for
              ensuring that all calls, text messages, voicemails, emails, and
              other communications you make to or with any lead, contact, or
              consumer — including any leads obtained through leadspply — fully
              comply with the Telephone Consumer Protection Act (TCPA), the
              Telemarketing Sales Rule (TSR), the federal and applicable state
              Do-Not-Call (DNC) rules, state telemarketing and calling-time
              laws, the CTIA Messaging Principles and Best Practices, A2P 10DLC
              requirements, and all other applicable federal and state
              communications laws.
            </p>
            <p>
              leadspply does not provide legal advice and does not warrant or
              guarantee that any lead, list, or contact is compliant, consented,
              scrubbed, or otherwise safe to contact. It is your responsibility
              to scrub against DNC and known-litigator lists, to obtain and
              retain documentation of any required prior express written
              consent, to honor all opt-out and revocation requests, and to
              maintain your own compliance program.
            </p>
            <p className="font-semibold">
              YOU EXPRESSLY ACKNOWLEDGE AND ASSUME ALL RISK OF TCPA AND OTHER
              COMMUNICATIONS-RELATED VIOLATIONS — INCLUDING THE RISK OF
              STATUTORY DAMAGES, PENALTIES, FINES, REGULATORY ACTION, AND
              LITIGATION — ARISING FROM YOUR CONTACT WITH ANY LEAD, CONTACT, OR
              CONSUMER. YOU AGREE THAT leadspply AND LEADS SPPLY LLC BEAR NO
              LIABILITY FOR ANY TCPA, DNC, OR OTHER COMMUNICATIONS-RELATED CLAIM
              ARISING FROM YOUR COMMUNICATIONS, AND YOU AGREE TO DEFEND,
              INDEMNIFY, AND HOLD leadspply HARMLESS FROM ANY SUCH CLAIM, IN
              ADDITION TO THE INDEMNIFICATION SET FORTH BELOW.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              General Disclaimer and Limitation of Liability
            </h2>
            <p>
              Although leadspply has attempted to provide accurate information
              on this Site, leadspply assumes no responsibility for the
              validity, accuracy, or usefulness of the information or Materials;
              nor does leadspply warrant that the information or Materials are
              up to date, that this Website shall be available at any particular
              time or in any given location, that any defects or errors will be
              corrected, or that the Materials are free of viruses or other
              harmful components. Your use of this Website is at your sole risk.
              leadspply may change the Materials or products mentioned at any
              time without notice. ALL INFORMATION AND MATERIALS PROVIDED ON
              THIS WEBSITE ARE PROVIDED &quot;AS IS&quot; WITH ALL FAULTS AND
              WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING
              WARRANTIES OF MERCHANTABILITY, SATISFACTORY QUALITY,
              NON-INFRINGEMENT OF INTELLECTUAL PROPERTY, OR FITNESS FOR A
              PARTICULAR PURPOSE. IN NO EVENT SHALL leadspply BE LIABLE FOR ANY
              DIRECT, INDIRECT, SPECIAL, CONSEQUENTIAL, OR INCIDENTAL DAMAGES
              (INCLUDING, WITHOUT LIMITATION, LOST PROFITS OR REVENUES, BUSINESS
              INTERRUPTION, COSTS OF REPLACEMENT GOODS, OR LOSS OR DAMAGE TO
              DATA) ARISING OUT OF THE USE OR INABILITY TO USE THIS SITE OR ANY
              leadspply PRODUCT OR SERVICE, OR DAMAGES RESULTING FROM USE OF OR
              RELIANCE ON THE INFORMATION PRESENTED, EVEN IF leadspply HAS BEEN
              ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. BECAUSE SOME
              JURISDICTIONS PROHIBIT THE EXCLUSION OR LIMITATION OF LIABILITY
              FOR CONSEQUENTIAL OR INCIDENTAL DAMAGES, THE ABOVE LIMITATION MAY
              NOT APPLY TO YOU.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Indemnification
            </h2>
            <p>
              UPON A REQUEST BY leadspply, YOU AGREE TO DEFEND, INDEMNIFY, AND
              HOLD HARMLESS leadspply AND LEADS SPPLY LLC AND ITS AFFILIATES,
              AGENTS, OR OTHER BUSINESS PARTNERS, AND ITS AND THEIR EMPLOYEES,
              CONTRACTORS, OFFICERS, AND DIRECTORS, FROM ALL LIABILITIES,
              CLAIMS, AND EXPENSES, INCLUDING ATTORNEYS&rsquo; FEES, THAT ARISE
              FROM YOUR USE OR MISUSE OF THIS SITE. leadspply RESERVES THE
              RIGHT, AT ITS OWN EXPENSE, TO ASSUME THE EXCLUSIVE DEFENSE AND
              CONTROL OF ANY MATTER OTHERWISE SUBJECT TO INDEMNIFICATION BY YOU,
              IN WHICH EVENT YOU AGREE TO COOPERATE WITH leadspply IN ASSERTING
              ANY AVAILABLE DEFENSES.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              General Provisions
            </h2>
            <p>
              Except as otherwise specified herein, these Terms and Conditions
              constitute the entire agreement between you and leadspply with
              respect to your use of this Website and supersede all prior
              communications and proposals (whether oral, written, or
              electronic) between you and leadspply with respect to use of this
              Website. Any rights not otherwise expressly granted by this
              Agreement are reserved by leadspply. The failure of leadspply to
              exercise or enforce any right or provision of these Terms and
              Conditions shall not constitute a waiver of such right or
              provision. If any part of these Terms and Conditions is held
              invalid or unenforceable by a court of competent jurisdiction,
              that portion shall be construed in a manner consistent with
              applicable law to reflect, as nearly as possible, the original
              intentions of the parties, and the remaining portions shall remain
              in full force and effect.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Change in Policy
            </h2>
            <p>
              By accessing or using this Website, you agree that you have read,
              understand, and agree to be bound by these Terms and Conditions.
              Please note that leadspply reserves the right to update and change
              these Terms and Conditions from time to time at its sole
              discretion. Please check the Terms and Conditions periodically for
              changes. Your continued use of this Website following the posting
              of any changes will confirm your acceptance of those changes. In
              the case of any violation of these Terms and Conditions, leadspply
              reserves the right to seek all remedies available in law and
              equity.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Choice of Law
            </h2>
            <p>
              These Terms and Conditions shall be governed by and construed in
              accordance with the laws of the State of Utah and applicable
              United States federal law, without reference to conflicts-of-laws
              provisions or principles.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Community / Slack Channel Use
            </h2>
            <p>
              Users agree not to share any information posted in any leadspply
              community or team channel (such as a leadspply Slack workspace or
              other group messaging channel) on any social media platform,
              including any personal social media accounts.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-olive mt-8">
              Privacy Policy
            </h2>
            <p>
              We are committed to protecting the privacy of any personal
              information you provide to us when you use the site. Please see
              our{" "}
              <Link
                to="https://leadspply.com/privacy"
                className="text-olive underline"
              >
                Privacy Policy
              </Link>{" "}
              for details; it is incorporated into this Agreement by reference.
            </p>
            <p>
              For questions, contact us at{" "}
              <a
                href="mailto:support@leadspply.com"
                className="text-olive underline"
              >
                support@leadspply.com
              </a>{" "}
              or Leads Spply LLC, 1261 S. 820 E. Suite #300, American Fork, Utah
              84003.
            </p>
          </section>
        </div>
      </details>
    </div>
  );
}

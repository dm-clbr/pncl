-- Correct the "Submit applications for recommended carriers" step description
-- to match the current carrier sheet sections: American Amicable was missing,
-- Kansas City Life belongs to SureLC #3 (not #1), and AuguStar / United Home
-- Life were added.
update portal_todos set
  description = E'Submit carrier applications in each SureLC account:\n• SureLC #1, "Basso Montemurro": American Amicable, American General Life (AIG/Corebridge), American Home Life, Liberty Bankers Life, Mutual of Omaha, Royal Neighbors, TransAmerica\n• SureLC #2, "The Pinnacle Life Group": Banner (Beyond Term), Fidelity & Guaranty\n• SureLC #3, "Pinnacle Life Group": AuguStar, Foresters, Kansas City Life\n• Ethos and United Home Life happen automatically — no action needed.',
  updated_at = now()
where slug = 'carrier_applications';

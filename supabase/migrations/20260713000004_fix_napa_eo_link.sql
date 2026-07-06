-- napa-benefits.com is a parked ad domain; the real NAPA site is napa-benefits.org.
update portal_todos
set
  href = 'https://www.napa-benefits.org/insurance/errors-and-omissions-eando-insurance',
  description = 'Purchase E&O coverage at NAPA-Benefits.org — you will need the "Newly Licensed <2 yrs." option, and select "Option A".',
  updated_at = now()
where slug = 'eo_insurance';

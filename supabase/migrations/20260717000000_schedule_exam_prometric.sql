-- Schedule your exam: Prometric only (remove NIPR language from the pre-license step).
update portal_todos
set
  href = 'https://www.prometric.com',
  external = true,
  action_label = 'Go to Prometric',
  description = 'Schedule your exam at a local facility or online through Prometric. Go to "Find Your Exam" and search for your home state and "insurance." This will populate a list of options. You are looking for "Life Insurance Producer" or some form of it.',
  updated_at = now()
where slug = 'schedule_exam';

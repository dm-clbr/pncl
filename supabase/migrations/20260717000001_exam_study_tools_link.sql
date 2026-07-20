-- Exam study tools: add XCEL Solutions link to the pre-license checklist step.
update portal_todos
set
  href = 'https://www.xcelsolutions.com',
  external = true,
  action_label = 'Go to XCEL Solutions',
  updated_at = now()
where slug = 'exam_study_tools';

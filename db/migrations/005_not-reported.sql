-- Add the explicit "not_reported" extraction state without rewriting any
-- existing answer keys. Review and update answer keys separately when the
-- workshop should treat an unmentioned finding as not_reported.
alter type finding_value add value if not exists 'not_reported';

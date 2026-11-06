# Knee MRI 12-Field Staging Package

`knee-mri-12-answer-keys.demo.json` is synthetic demo data for rehearsing the
admin answer-key import pipeline in a disposable PostgreSQL database.

The file covers the 50 filenames currently present in
`seed-data/mock-reports/`. Its labels are deterministic placeholders created
to exercise schema validation and versioned writes. They are not clinically
adjudicated, must not be used for scoring, and must not be promoted to
production.

Safety properties:

- `write` and `overwrite` default to `false`.
- The package is outside `public/` and is not browser-accessible.
- Production seed scripts do not load this directory.
- Importing it does not activate `knee_mri_12_basic`.
- The payload contains no report text, six-field answer keys, access codes, or
  secrets.

Follow the staging rehearsal sequence in `REPORT_IMPORT_GUIDE.md`. Use a
disposable or disposable PostgreSQL database, validate first, and never reuse these
placeholder labels as real answer keys.

ALTER TABLE public.parser_runtime_provenance
  DROP CONSTRAINT parser_runtime_provenance_attestation_version_check,
  ADD CONSTRAINT parser_runtime_provenance_attestation_version_check
    CHECK (attestation_version = 3);
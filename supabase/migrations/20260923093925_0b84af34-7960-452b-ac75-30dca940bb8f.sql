ALTER TABLE public.parser_runtime_provenance
  DROP CONSTRAINT parser_runtime_provenance_verification_method_check,
  ADD CONSTRAINT parser_runtime_provenance_verification_method_check
    CHECK (verification_method = 'GITHUB_ACTIONS_SIGNED_ATTESTATION_V3');

COMMENT ON CONSTRAINT parser_runtime_provenance_verification_method_check ON public.parser_runtime_provenance IS
  'R5.7.5 fail-closed: only the signed GitHub Actions attestation v3 verification method is accepted; legacy v1/v2 labels are rejected.';
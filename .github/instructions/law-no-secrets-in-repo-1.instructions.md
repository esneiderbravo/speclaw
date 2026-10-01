---
applyTo: "**/.env,**/.env.*,**/*.env"
---
# No secrets in the repository

<!-- speclaw:law-id law~no-secrets-in-repo~1 -->

Never write a .env file into the repository. Secrets live in the environment, not in version control.
<!-- speclaw:begin-provenance
  law: law~no-secrets-in-repo~1
  source: compile
  digest: sha256:b52ce9f9a77fb503babeed8da12e66c0cd3987b25429f8421431011f89bd46a1
  generator: @esneiderbravo/speclaw@2.0.0
speclaw:end-provenance -->

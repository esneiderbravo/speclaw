---
applyTo: "src/modules/*/assets/**"
---
# Protect the templates

<!-- speclaw:law-id law~protect-templates~1 -->

Assets under src/modules/*/assets/** are product output — keep the {{placeholder}} and speclaw-init contracts intact, and let the build copy them (never hand-copy into dist/).
<!-- speclaw:begin-provenance
  law: law~protect-templates~1
  source: compile
  digest: sha256:c9cc307bb2644611abdab8cf34c65ec476848c1bbd6d6fe7b3dd56dd3cafb6f9
  generator: @esneiderbravo/speclaw@2.0.0
speclaw:end-provenance -->

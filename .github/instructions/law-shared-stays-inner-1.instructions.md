---
applyTo: "src/shared/**"
---
# shared stays the innermost layer

<!-- speclaw:law-id law~shared-stays-inner~1 -->

src/shared must not import from src/modules or src/cli.
<!-- speclaw:begin-provenance
  law: law~shared-stays-inner~1
  source: compile
  digest: sha256:249910f9bc30dbe3d83a30920e790077267b07c9907eaaae3b399662617da001
  generator: @esneiderbravo/speclaw@2.0.0
speclaw:end-provenance -->

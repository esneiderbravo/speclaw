# Contributing to speclaw

Thanks for your interest — speclaw is open source (MIT) and community input is
welcome. Please read this before opening a pull request.

## Ground rules

- **`main` is protected.** No change lands without a pull request that is
  **reviewed and approved by the maintainer** ([@esneiderbravo](https://github.com/esneiderbravo)).
  Direct pushes to `main`, force-pushes, and branch deletions are not permitted.
- **Every path is owned by the maintainer** (see [`.github/CODEOWNERS`](.github/CODEOWNERS)).
  A code-owner approval is required to merge — always.
- The maintainer has final say on what is merged. Not every PR will be
  accepted, and that's okay: scope and direction are curated on purpose.

## Stable install one-liner (do not break)

The primary documented install command is:

```bash
npx @esneiderbravo/speclaw@latest init
```

This string is a **frozen contract**. Third-party directories and newsletters
copy it and never update. It MUST keep working; if a new install path is ever
needed, the old one-liner MUST continue to work (and MAY print a notice). Do
not invent alternate first-line install commands in the README.

## Trusted publishing (maintainers)

Releases publish via npm **Trusted Publishing (OIDC)** from
`.github/workflows/publish.yml` when `package.json` version changes on `main`.
There is no long-lived `NPM_TOKEN` in CI.

1. On npmjs.com → package settings → **Trusted Publisher**: repository
   `esneiderbravo/speclaw`, workflow `publish.yml`.
2. After OIDC publish works, **revoke any classic npm tokens** that could still
   publish the package — a leftover token defeats the model.
3. Anyone can verify a release:

   ```bash
   npm audit signatures
   gh attestation verify <tarball> --owner esneiderbravo
   ```

Roadmap pieces that ship product behavior MUST bump `package.json` (and the
lockfile) in the same PR so auto-publish runs.

## How to propose a change

1. **Fork** the repository and create a branch from `main`.
2. Make your change. Keep the diff focused and small.
3. **Build and verify locally:**
   ```bash
   npm ci
   npm run build
   npm test
   ```
4. **Open a pull request** describing *what* changed and *why*. Link any
   related issue.

## What the maintainer reviews for

- Correctness and safety.
- Fit with the project's philosophy (self-contained, local-first, no LLM/cloud
  dependencies, token-efficient).
- Clear scope — one concern per PR.

## Reporting issues

Open a GitHub issue with the **Bug report** template. Paste
`speclaw doctor --json` (required; redacted by default). For anything
security-sensitive, please **do not** open a public issue — contact the
maintainer directly.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).

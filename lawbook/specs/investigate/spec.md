# investigate

`lawbook_investigate` ranks the likely origins of a bug from the code graph.

### Requirement: Suspects lie on the failing test's path

WHEN a hint path or a stack frame names a file, the system SHALL rank only symbols reachable by calls from that file, plus non-test stack frames and their callers.

#### Scenario: Look-alikes off the path are not suspects
- Given a failing test that reaches `roundCents` through `checkout` and `withTax`, and look-alike `auditRound` helpers elsewhere
- When investigate runs with the test's stack trace
- Then `roundCents` ranks first and no `auditRound` helper is listed

### Requirement: A test is never a suspect

WHEN a stack frame lies in a test file, the system SHALL seed the reachable walk from it without listing it among the suspects.

#### Scenario: The assertion frame is not ranked
- Given a trace whose only project frame is in `test/checkout.test.js`
- When investigate runs
- Then no suspect's file is under `test/`

### Requirement: Compact result

WHEN investigate returns, the system SHALL list at most 5 suspects by default, leaving runtime and dependency frames out of `unresolvedFrames`.

#### Scenario: Runtime frames are not listed
- Given a trace with `node:async_hooks` frames
- When investigate runs
- Then `unresolvedFrames` is empty

### Requirement: Symlinked roots

WHEN a trace path names the real path of a project opened through a symlink, the system SHALL resolve it to the project-relative path.

#### Scenario: macOS /tmp
- Given a project opened at a symlink whose real path differs
- When a frame names `file://<real root>/src/a.js`
- Then the frame's file is `src/a.js`

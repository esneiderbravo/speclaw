# Tasks — doc-hint-background

- [x] 0.1 Branch `fix/doc-hint-background`
- [x] 1.1 Cache `measureDiff` per file set in `.speclaw/level-cache.json`; ship reuses it
- [x] 1.2 `speclaw measure-diff` CLI job; `docHint` starts it detached on a cache miss and returns
- [x] 1.3 Record `told` only when a hint is returned; pending fast path without listing files
- [x] 1.4 Strip quotes and escapes from the nudge's search pattern
- [x] 2.1 Tests: background job writes the cache without the hook waiting; ship reuses the cache; hint follows measurement; quoted pattern (red before the fix)
- [x] 2.2 Measure on a /tmp clone of ftd-admin-finanzas: hook latency and stop overhead, 2.0.20 vs 2.0.21
- [x] 2.3 Gates: check, build, test
- [x] 2.4 Bump to 2.0.21 with CHANGELOG

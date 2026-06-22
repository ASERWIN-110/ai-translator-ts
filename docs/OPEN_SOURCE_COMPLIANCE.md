# Open Source Compliance

This project is a TypeScript/Electron rewrite derived from and intentionally compatible with `jxq1997216/AITranslator`.

## License Status

The upstream project is licensed under GPL-3.0. This rewrite includes behavior, prompt templates, translated template structure, and compatibility logic based on that project, so this repository is also licensed under GPL-3.0-only.

Publishing and pushing this repository is compliant if the following conditions are kept:

- Keep the GPL-3.0 license file in the repository.
- Keep `package.json` license as `GPL-3.0-only`.
- Publish the corresponding source code for distributed binaries.
- Preserve attribution to the upstream project.
- Do not distribute closed-source builds based on this code.

## Upstream Attribution

Original project:

```text
AITranslator
https://github.com/jxq1997216/AITranslator
License: GPL-3.0
```

The original source is not committed into this repository. It was cloned into `upstream-reference/` only as a local reference and is ignored by git.

The original GPL license text is included as `LICENSE`. Upstream templates copied for compatibility are stored under:

```text
data/upstream-templates/
```

## Third-Party Runtime Components

This application uses Electron and TypeScript tooling through npm packages. Their own licenses are managed through `package-lock.json` and npm package metadata.

The normal edition does not bundle a GGUF model, CUDA runtime, Torch runtime, or llama.cpp binary by default. Users can configure an external OpenAI-compatible API or provide their own `llama-server` binary and GGUF model.

The embedded special edition bundles `node-llama-cpp` and its platform native bindings. `node-llama-cpp` is MIT-licensed and wraps llama.cpp. Do not bundle third-party GGUF models unless their model license permits redistribution.

## Release Guidance

If binary releases are published, attach the source archive or link to the exact source tag used to build them. For GitHub releases, tag the source commit and upload platform artifacts generated from that tag.

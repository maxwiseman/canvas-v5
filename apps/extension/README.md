# WXT + React

This template should help get you started developing with React in WXT.

## GitHub releases

Publishing a GitHub Release automatically builds the Chrome and Firefox
extensions and attaches their ZIP files to the release. The Firefox source ZIP
needed for Mozilla review is attached too.

Release notes live in the repository's `changelog/` directory. The release
process is documented for agents in the root `AGENTS.md`; it commits the version
notes, tags that exact commit, pushes the tag, and publishes the release with
the version file as its notes. The **Extension release** action then adds the
ZIP files under the release's **Assets** section.

The numeric part of the tag becomes the extension manifest version. Tags must
look like `v1.2.3`, `1.2.3`, or use an optional fourth numeric component.

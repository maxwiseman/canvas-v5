# WXT + React

This template should help get you started developing with React in WXT.

## GitHub releases

Publishing a GitHub Release automatically builds the Chrome and Firefox
extensions and attaches their ZIP files to the release. The Firefox source ZIP
needed for Mozilla review is attached too.

1. Merge the release changes into the default branch.
2. In GitHub, open **Releases**, then choose **Draft a new release**.
3. Create a new tag such as `v0.1.0` from the default branch.
4. Add release notes and choose **Publish release**.
5. Wait for the **Extension release** action to finish. Its ZIP files will
   appear under the release's **Assets** section.

The numeric part of the tag becomes the extension manifest version. Tags must
look like `v1.2.3`, `1.2.3`, or use an optional fourth numeric component.

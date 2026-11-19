// Evaluated variants of the pointer configuration (eval/variants.ts). Results of variants that
// are no longer listed here are kept in results/; each result file records its exact spec.
export const VARIANTS = {
  // The configuration the app uses: shared/prompts/pointer-extract.v2.md + shared/schemas (v2).
  // The app's configuration on contract v1.3 skeletons, without and with the name clean-up.
  v13: {},
  v13r: {},
  v13t: { tidy: true },
  v13tr: { tidy: true },
  // Contract v1.4 skeletons (introducers kept, section 4.2). Every result is scored without and with
  // the clean-up; `tidy` decides which one the main table shows.
  v14: { tidy: true, skeletons: 'v1.4' },
  v14r: { tidy: true, skeletons: 'v1.4' },
  // Candidate prompt: gross pay is the total line, never a single earnings line.
  v14p3: { tidy: true, skeletons: 'v1.4', prompt: 'v3' },
  v14p3r: { tidy: true, skeletons: 'v1.4', prompt: 'v3' },
  // Candidate prompt: v3 plus "hours and rate are those of the Regular (base pay) line".
  v15p4: { tidy: true, skeletons: 'v1.5', prompt: 'v4' },
  v15p4r: { tidy: true, skeletons: 'v1.5', prompt: 'v4' },
  // The app's cloud request since contract v1.24 (pointer-extract.v5, whose text is v4's word for word), on the held-out set.
  h36: { tidy: true, skeletons: 'v1.36', prompt: 'v5' },
};

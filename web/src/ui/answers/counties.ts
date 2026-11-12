// Counties a person can choose for "Help near you", with the point sent instead of any location:
// the county's center. Static app data per jurisdiction. The demo rule set has one invented county.

export interface County {
  readonly id: string;
  readonly name: string;
  readonly centroid: { readonly latitude: number; readonly longitude: number };
}

const COUNTIES: Readonly<Record<string, readonly County[]>> = {
  'zz-test': [{ id: 'testshire', name: 'Testshire (demo)', centroid: { latitude: 0, longitude: 0 } }],
};

export function countiesFor(jurisdiction: string): readonly County[] {
  return COUNTIES[jurisdiction] ?? [];
}

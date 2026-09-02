export type TSaveLocationPayload = {
  name: string;
  location: {
    type?: 'Point';
    coordinates: [number, number];
  };
  buildingNo?: number | null;
  floorNo?: number | null;
  apartment?: number | null;
  city: string;
  country: string;
};

export type TCampainPayload = {
  title: string;
  banner: string;
  products?: string[];
};

export type TUpdateCampainPayload = Partial<TCampainPayload>;

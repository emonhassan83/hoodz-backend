export type TCampainPayload = {
  title: string;
  products: string[];
};

export type TUpdateCampainPayload = Partial<TCampainPayload>;
